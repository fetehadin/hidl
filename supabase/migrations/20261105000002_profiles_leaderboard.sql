-- Public profiles (a display name and a picture) and the photo-streak leaderboard.
--
-- Profiles: `profiles` gains display_name, picture_path and show_on_leaderboard. A profile row
-- can now exist without a buddy (avatar becomes nullable). Pictures live in a new *public*
-- `avatars` bucket (<user_id>/<16 hex>.webp|jpg, 512 KB, images only): they're meant to be
-- seen by other people on the leaderboard. Nobody can read anyone else's profile row; other
-- people's names and pictures only come out through leaderboard().
--
-- Leaderboard: everyone is on it unless they switch show_on_leaderboard off. A person's score
-- for a week (Monday to Sunday) or a month is their longest run of consecutive days with an
-- on-time photo: a photo *for* that day added *on* that day, in their own time zone. Backfilled
-- days don't count, so the board can't be climbed by uploading old pictures. Periods follow
-- app_today() (Addis Ababa), the same for everyone.
--
-- Results of a finished period are "released": frozen into leaderboard_results the first time
-- anyone looks at that period after it ends, so later deletions or name changes don't
-- reshuffle a published ranking (names and pictures are still read live, and someone who has
-- since opted out shows anonymously).

-- ---------------------------------------------------------------------------------------------
-- Profiles

alter table public.profiles alter column avatar drop not null;

alter table public.profiles
  add column display_name text,
  add column picture_path text,
  add column show_on_leaderboard boolean not null default true;

-- Mirrors src/lib/profile-rules.ts: change both together.
create or replace function public.display_name_ok(n text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select n is null or (
    char_length(n) between 2 and 24
    and n = btrim(n)
    and n !~ '\s{2,}'
    and n !~ '[[:cntrl:]]'
    and n ~ '[[:alnum:]]'
    and lower(n) !~ '(admin|hidl|moderator|support)'
  );
$$;

alter table public.profiles
  add constraint profiles_display_name_ok check (public.display_name_ok(display_name)),
  add constraint profiles_picture_path_ok check (
    picture_path is null or picture_path ~ ('^' || user_id::text || '/[0-9a-f]{16}\.(webp|jpg)$')
  );

-- Names are unique ignoring case, so nobody can pass as someone else on the board.
create unique index profiles_display_name_unique on public.profiles (lower(display_name)) where display_name is not null;

revoke all on table public.profiles from anon, authenticated;
grant select, delete on table public.profiles to authenticated;
grant insert (avatar, display_name, picture_path, show_on_leaderboard) on table public.profiles to authenticated;
grant update (avatar, display_name, picture_path, show_on_leaderboard) on table public.profiles to authenticated;

-- Public bucket for profile pictures. Anyone with the URL can see a picture (that's the point);
-- only the owner can put files in their folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/webp', 'image/jpeg']);

create policy "avatars bucket: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars bucket: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars bucket: update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars bucket: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------------
-- Leaderboard

create table public.leaderboard_releases (
  period text not null check (period in ('week', 'month')),
  period_start date not null,
  released_at timestamptz not null default now(),
  primary key (period, period_start)
);

create table public.leaderboard_results (
  period text not null,
  period_start date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  rank int not null check (rank >= 1),
  streak int not null check (streak >= 1),
  photo_days int not null check (photo_days >= streak),
  primary key (period, period_start, user_id),
  foreign key (period, period_start) references public.leaderboard_releases (period, period_start) on delete cascade
);

alter table public.leaderboard_releases enable row level security;
alter table public.leaderboard_results enable row level security;
revoke all on table public.leaderboard_releases from anon, authenticated;
revoke all on table public.leaderboard_results from anon, authenticated;

-- First day of the period containing `d`, and of the one `back` periods before it.
create or replace function public.leaderboard_period_start(p_period text, d date, back int default 0)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'week' then (date_trunc('week', d::timestamp) - make_interval(weeks => back))::date
    when 'month' then (date_trunc('month', d::timestamp) - make_interval(months => back))::date
  end;
$$;

create or replace function public.leaderboard_period_end(p_period text, p_start date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'week' then p_start + 6
    when 'month' then (p_start + interval '1 month' - interval '1 day')::date
  end;
$$;

-- Everyone's streak for [p_start, p_end], best first. Internal: no API role may call it.
create or replace function public.leaderboard_compute(p_start date, p_end date)
returns table (user_id uuid, rank int, streak int, photo_days int)
language sql
stable
security definer
set search_path = ''
as $$
  with on_time as (
    select distinct p.user_id, p.date
    from public.photos p
    left join public.user_settings s on s.user_id = p.user_id
    where p.date between p_start and p_end
      and (p.created_at at time zone coalesce(s.time_zone, 'Africa/Addis_Ababa'))::date = p.date
  ),
  -- Consecutive days share date - row_number(): the classic gaps-and-islands grouping.
  islands as (
    select o.user_id, o.date - (row_number() over (partition by o.user_id order by o.date))::int as grp
    from on_time o
  ),
  runs as (
    select i.user_id, count(*)::int as len from islands i group by i.user_id, i.grp
  ),
  scores as (
    select r.user_id, max(r.len)::int as streak, sum(r.len)::int as photo_days
    from runs r
    left join public.profiles pr on pr.user_id = r.user_id
    where coalesce(pr.show_on_leaderboard, true)
    group by r.user_id
  )
  select sc.user_id, (rank() over (order by sc.streak desc, sc.photo_days desc))::int, sc.streak, sc.photo_days
  from scores sc;
$$;

revoke execute on function public.leaderboard_compute(date, date) from public, anon, authenticated;

-- The board for this period (p_previous = false) or the released results of the last one.
-- Top 50 plus the caller's own row. Other people come back as a name, buddy and picture only:
-- no user ids, no emails.
create or replace function public.leaderboard(p_period text, p_previous boolean default false)
returns table (
  rank int,
  display_name text,
  avatar jsonb,
  picture_path text,
  streak int,
  photo_days int,
  is_me boolean,
  period_start date,
  period_end date
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_period not in ('week', 'month') then
    raise exception 'unknown period' using errcode = '22023';
  end if;
  v_start := public.leaderboard_period_start(p_period, public.app_today(), case when p_previous then 1 else 0 end);
  v_end := public.leaderboard_period_end(p_period, v_start);

  if not p_previous then
    return query
      select c.rank, pr.display_name, pr.avatar, pr.picture_path, c.streak, c.photo_days,
        c.user_id = auth.uid(), v_start, v_end
      from public.leaderboard_compute(v_start, v_end) c
      left join public.profiles pr on pr.user_id = c.user_id
      where c.rank <= 50 or c.user_id = auth.uid()
      order by c.rank, pr.display_name nulls last;
    return;
  end if;

  -- Release the finished period once; concurrent first viewers race on the primary key.
  insert into public.leaderboard_releases (period, period_start) values (p_period, v_start)
  on conflict do nothing;
  if found then
    insert into public.leaderboard_results (period, period_start, user_id, rank, streak, photo_days)
    select p_period, v_start, c.user_id, c.rank, c.streak, c.photo_days
    from public.leaderboard_compute(v_start, v_end) c
    where c.rank <= 100;
  end if;

  return query
    select r.rank,
      case when coalesce(pr.show_on_leaderboard, true) then pr.display_name end,
      case when coalesce(pr.show_on_leaderboard, true) then pr.avatar end,
      case when coalesce(pr.show_on_leaderboard, true) then pr.picture_path end,
      r.streak, r.photo_days, r.user_id = auth.uid(), v_start, v_end
    from public.leaderboard_results r
    left join public.profiles pr on pr.user_id = r.user_id
    where r.period = p_period and r.period_start = v_start
      and (r.rank <= 50 or r.user_id = auth.uid())
    order by r.rank, pr.display_name nulls last;
end;
$$;

revoke execute on function public.leaderboard(text, boolean) from public, anon;
grant execute on function public.leaderboard(text, boolean) to authenticated;

-- Whether a display name is free (case-insensitive), for the profile form. Says nothing else.
create or replace function public.display_name_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles
    where lower(display_name) = lower(btrim(p_name)) and user_id <> auth.uid()
  );
$$;

revoke execute on function public.display_name_available(text) from public, anon;
grant execute on function public.display_name_available(text) to authenticated;
