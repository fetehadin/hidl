-- A record of every photo/video file, whichever store holds it (Supabase Storage today, the
-- self-hosted S3 store on the VPS after the move: see docs/storage.md). Storage policies stop
-- protecting files once they leave Supabase, so the rules that used to live there live here:
--
--   * a file is reserved (reserve_media) before the server hands out an upload link, so
--     paths stay in the owner's folder, sizes and types stay within the limits, and
--   * each person has 2 GB (media_quota_bytes) and at most 120 files an hour.
--
-- Users can't read or write the table: they could otherwise lie about sizes or "forget" a file to
-- free space. The server confirms (after checking the uploaded file) and removes rows with the
-- service role, always together with the file itself. Sizes are exact: the upload link is
-- signed for the reserved size, and the server checks the stored file matches before saving.

create table public.media_objects (
  path text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  bytes bigint not null,
  content_type text not null,
  created_at timestamptz not null default now(),
  -- Set once the server has checked the stored file (size, type, first bytes).
  confirmed_at timestamptz,
  -- Inside the owner's folder. New uploads must also follow the app's naming (reserve_media);
  -- this looser rule keeps files from older versions of the app (<user>/<date>/<random>.jpg).
  constraint media_objects_path_ok check (
    path like user_id::text || '/%' and path ~ '^[0-9a-f-]{36}/[A-Za-z0-9/_.-]+$' and path !~ '\.\.|//'
  ),
  -- Mirrors MAX_UPLOAD_BYTES in src/lib/media.ts.
  constraint media_objects_bytes_ok check (bytes between 1 and 5242880),
  constraint media_objects_type_ok check (
    content_type = case substring(path from '\.([a-z0-9]+)$')
      when 'webp' then 'image/webp'
      when 'jpg' then 'image/jpeg'
      when 'mp4' then 'video/mp4'
      when 'webm' then 'video/webm'
      when 'mov' then 'video/quicktime'
    end
  )
);

create index media_objects_user_created on public.media_objects (user_id, created_at);

alter table public.media_objects enable row level security;
revoke all on table public.media_objects from public, anon, authenticated;

-- Everything already in the photos bucket.
insert into public.media_objects (path, user_id, bytes, content_type, created_at, confirmed_at)
select o.name, o.owner_id::uuid, (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype', o.created_at, o.created_at
from storage.objects o
join auth.users u on u.id::text = (storage.foldername(o.name))[1] and u.id::text = o.owner_id
where o.bucket_id = 'photos'
  and o.name ~ '^[0-9a-f-]{36}/[A-Za-z0-9/_.-]+$' and o.name !~ '\.\.|//'
  and (o.metadata ->> 'size')::bigint between 1 and 5242880
  and o.metadata ->> 'mimetype' = case substring(o.name from '\.([a-z0-9]+)$')
      when 'webp' then 'image/webp' when 'jpg' then 'image/jpeg' when 'mp4' then 'video/mp4'
      when 'webm' then 'video/webm' when 'mov' then 'video/quicktime' end
on conflict do nothing;

-- Each person's photo space. Mirrors MEDIA_QUOTA_BYTES in src/lib/media.ts.
create function public.media_quota_bytes()
returns bigint
language sql
immutable
set search_path = ''
as $$ select 2147483648::bigint $$;

grant execute on function public.media_quota_bytes() to authenticated;

-- Reserves one or two files (a photo or video and its thumbnail) in the caller's folder before an
-- upload link is signed for them. 53400 = more than 120 files in the last hour, 53100 = over the
-- 2 GB space, 23514 = a bad path/size/type, 23505 = that path is taken.
create function public.reserve_media(p_files jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
  v_recent int;
  v_used bigint;
  v_new bigint;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if jsonb_typeof(p_files) is distinct from 'array' then
    raise exception 'files must be a list' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_files);
  if v_n not between 1 and 2 then
    raise exception 'one or two files at a time' using errcode = '22023';
  end if;

  -- One reservation at a time per person, so two tabs can't both slip under the limits.
  perform pg_advisory_xact_lock(hashtextextended('media:' || v_uid::text, 0));

  select count(*) into v_recent
  from public.media_objects where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent + v_n > 120 then
    raise exception 'too many uploads, try again later' using errcode = '53400';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_files) f
    where coalesce(f ->> 'path', '') !~ ('^' || v_uid::text || '/\d{4}-\d{2}-\d{2}-[a-z0-9]{10,}(-thumb)?\.(webp|jpg|mp4|webm|mov)$')
  ) then
    raise exception 'bad file name' using errcode = '23514';
  end if;

  select coalesce(sum((f ->> 'bytes')::bigint), 0) into v_new from jsonb_array_elements(p_files) f;
  select coalesce(sum(bytes), 0) into v_used from public.media_objects where user_id = v_uid;
  if v_used + v_new > public.media_quota_bytes() then
    raise exception 'photo space is full' using errcode = '53100';
  end if;

  insert into public.media_objects (path, user_id, bytes, content_type)
  select f ->> 'path', v_uid, (f ->> 'bytes')::bigint, f ->> 'content_type'
  from jsonb_array_elements(p_files) f;
end;
$$;

revoke execute on function public.reserve_media(jsonb) from public, anon;
grant execute on function public.reserve_media(jsonb) to authenticated;

-- How much photo space the caller uses, and how much they have.
create function public.media_usage()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'used', coalesce((select sum(bytes) from public.media_objects where user_id = auth.uid()), 0),
    'quota', public.media_quota_bytes()
  )
$$;

revoke execute on function public.media_usage() from public, anon;
grant execute on function public.media_usage() to authenticated;

-- Admin numbers now count the record above instead of Supabase's storage.objects, so they stay
-- right after the files move. Same functions as before otherwise.
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_admin();
  with today as (select public.app_today() as d),
  days as (
    select g::date as day
    from today, generate_series(today.d - 29, today.d, interval '1 day') as g
  ),
  daily as (
    select days.day,
      (select count(*) from public.usage_daily u where u.day = days.day)::int as people,
      (select coalesce(sum(u.visits), 0) from public.usage_daily u where u.day = days.day)::int as visits,
      (select count(*) from auth.users a
        where (a.created_at at time zone 'Africa/Addis_Ababa')::date = days.day)::int as signups
    from days
  )
  select jsonb_build_object(
    'people', (select count(*) from auth.users),
    'signups_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'suspended', (select count(*) from auth.users where banned_until > now()),
    'admins', (select count(*) from public.admins),
    'active_today', (select count(*) from public.usage_daily, today where day = today.d),
    'active_7d', (select count(distinct user_id) from public.usage_daily, today where day > today.d - 7),
    'active_30d', (select count(distinct user_id) from public.usage_daily, today where day > today.d - 30),
    'visits_30d', (select coalesce(sum(visits), 0) from public.usage_daily, today where day > today.d - 30),
    -- Came back on at least two different days in the last 30.
    'returning_30d', (select count(*) from (
      select user_id from public.usage_daily, today where day > today.d - 30
      group by user_id having count(*) >= 2) r),
    -- Week-1 retention: of the people who signed up 8 to 37 days ago, how many used hidl again
    -- 7 to 13 days after signing up (days in hidl's default zone, like `daily` below).
    'retention_cohort', (select count(*) from auth.users a, today
      where (a.created_at at time zone 'Africa/Addis_Ababa')::date between today.d - 37 and today.d - 8),
    'retention_d7', (select count(*) from auth.users a, today
      where (a.created_at at time zone 'Africa/Addis_Ababa')::date between today.d - 37 and today.d - 8
        and exists (select 1 from public.usage_daily u where u.user_id = a.id
          and u.day between (a.created_at at time zone 'Africa/Addis_Ababa')::date + 7
                        and (a.created_at at time zone 'Africa/Addis_Ababa')::date + 13)),
    'letters', (select count(*) from public.letters),
    'letters_opened', (select count(*) from public.letters where opened_at is not null),
    'letters_sealed', (select count(*) from public.letters where opened_at is null and unlock_at > now()),
    'letters_encrypted', (select count(*) from public.letters where encrypted),
    'photos', (select count(*) from public.photos where media_type = 'image'),
    'videos', (select count(*) from public.photos where media_type = 'video'),
    'countdowns', (select count(*) from public.countdowns),
    'storage_bytes', (select coalesce(sum(bytes), 0) from public.media_objects),
    'storage_files', (select count(*) from public.media_objects),
    -- People at 90% or more of their photo space.
    'storage_near_quota', (select count(*) from (
      select user_id from public.media_objects group by user_id
      having sum(bytes) >= public.media_quota_bytes() * 0.9) q),
    'feedback_new', (select count(*) from public.feedback where status = 'new'),
    'feedback_open', (select count(*) from public.feedback where status in ('new', 'in_progress')),
    'last_unlock_email_at', (select max(unlock_email_sent_at) from public.letters),
    'daily', (select jsonb_agg(jsonb_build_object('day', day, 'people', people, 'visits', visits, 'signups', signups) order by day) from daily)
  )
  into v;
  return v;
end;
$$;

revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

create or replace function public.admin_user_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed_at', u.email_confirmed_at,
    'banned_until', u.banned_until,
    'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
    'calendar', u.raw_user_meta_data ->> 'calendar',
    'time_zone', (select s.time_zone from public.user_settings s where s.user_id = u.id),
    'is_admin', exists (select 1 from public.admins a where a.user_id = u.id),
    'admin_role', (select a.role from public.admins a where a.user_id = u.id),
    'last_active', (select max(d.day) from public.usage_daily d where d.user_id = u.id),
    'active_days_30d', (select count(*) from public.usage_daily d where d.user_id = u.id and d.day > public.app_today() - 30),
    'visits_30d', (select coalesce(sum(d.visits), 0) from public.usage_daily d where d.user_id = u.id and d.day > public.app_today() - 30),
    'letters', (select count(*) from public.letters l where l.user_id = u.id),
    'letters_sealed', (select count(*) from public.letters l where l.user_id = u.id and l.unlock_at > now()),
    'letters_encrypted', (select count(*) from public.letters l where l.user_id = u.id and l.encrypted),
    'photos', (select count(*) from public.photos p where p.user_id = u.id and p.media_type = 'image'),
    'videos', (select count(*) from public.photos p where p.user_id = u.id and p.media_type = 'video'),
    'countdowns', (select count(*) from public.countdowns c where c.user_id = u.id),
    'storage_bytes', (select coalesce(sum(m.bytes), 0) from public.media_objects m where m.user_id = u.id),
    'storage_quota', public.media_quota_bytes(),
    'has_letter_key', exists (select 1 from public.letter_keys k where k.user_id = u.id)
  )
  into v
  from auth.users u
  where u.id = p_id;
  return v;
end;
$$;

revoke execute on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;
