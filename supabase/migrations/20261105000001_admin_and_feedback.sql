-- The admin panel (/admin) and in-app feedback.
--
-- Who is an admin lives in public.admins, which nobody can read or write directly. Everything an
-- admin sees or changes goes through a SECURITY DEFINER function below that starts with
-- assert_admin(), so a signed-in non-admin calling the same RPCs gets 42501, exactly like anon.
-- The first admin is added by hand (README → "Admin panel"); after that, admins add each other.
--
-- Letter bodies stay out of reach of admins too: nothing here selects letters.body, and
-- encrypted letters couldn't be read anyway. Admins see counts, never content.
--
-- The usage numbers that used to be public (/stats, public_stats()) are admin-only now:
-- admin_stats() replaces public_stats(), which is dropped.

-- ---------------------------------------------------------------------------------------------
-- Admins

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on table public.admins from anon, authenticated;

-- Whether the caller is an admin. Safe for anyone signed in to ask about themselves.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Internal guard, called first by every admin_* function. Not executable by API roles.
create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assert_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Audit log: one row per thing an admin did. Kept when the admin or the target account is
-- deleted (no cascade, emails copied in), because "who deleted this account" must outlive it.

create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  admin_email text not null,
  action text not null check (action ~ '^[a-z_.]{1,40}$'),
  target_user uuid,
  target_email text,
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 4000),
  created_at timestamptz not null default now()
);

create index admin_audit_created_at on public.admin_audit (created_at desc);
create index admin_audit_target on public.admin_audit (target_user, created_at desc);

alter table public.admin_audit enable row level security;
revoke all on table public.admin_audit from anon, authenticated;

-- Records an admin action. Used by the functions below and by the app for the actions that
-- go through the Auth admin API (suspending and deleting accounts).
create or replace function public.admin_log(p_action text, p_target uuid default null, p_details jsonb default '{}')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  insert into public.admin_audit (admin_id, admin_email, action, target_user, target_email, details)
  values (
    auth.uid(),
    coalesce((select email from auth.users where id = auth.uid()), ''),
    p_action,
    p_target,
    (select email from auth.users where id = p_target),
    coalesce(p_details, '{}')
  );
end;
$$;

revoke execute on function public.admin_log(text, uuid, jsonb) from public, anon;
grant execute on function public.admin_log(text, uuid, jsonb) to authenticated;

create or replace function public.admin_audit_log(p_target uuid default null, p_limit int default 100, p_before bigint default null)
returns table (
  id bigint,
  admin_email text,
  action text,
  target_user uuid,
  target_email text,
  target_exists boolean,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select a.id, a.admin_email, a.action, a.target_user, a.target_email,
      exists (select 1 from auth.users u where u.id = a.target_user), a.details, a.created_at
    from public.admin_audit a
    where (p_target is null or a.target_user = p_target)
      and (p_before is null or a.id < p_before)
    order by a.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke execute on function public.admin_audit_log(uuid, int, bigint) from public, anon;
grant execute on function public.admin_audit_log(uuid, int, bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Feedback: anyone signed in can send it and see their own (with the status and any reply);
-- only admins see everyone's and change status/reply.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bug', 'idea', 'praise', 'other')),
  message text not null check (char_length(btrim(message)) between 3 and 4000),
  page text check (page is null or (char_length(page) <= 200 and page ~ '^/')),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'archived')),
  reply text check (reply is null or char_length(btrim(reply)) between 1 and 4000),
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_user on public.feedback (user_id, created_at desc);
create index feedback_status on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

create policy "feedback: read own" on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy "feedback: insert own" on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()));

-- No UPDATE or DELETE for users: once sent, it's the admins'. user_agent isn't readable back.
revoke all on table public.feedback from anon, authenticated;
grant select (id, kind, message, page, status, reply, replied_at, created_at) on table public.feedback to authenticated;
grant insert (kind, message, page, user_agent) on table public.feedback to authenticated;

-- Server-side defaults the client can't override, and a flood limit: 10 per person per day.
create or replace function public.feedback_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := 'new';
  new.reply := null;
  new.replied_at := null;
  new.created_at := now();
  new.updated_at := now();
  if (select count(*) from public.feedback f
      where f.user_id = new.user_id and f.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too much feedback today' using errcode = '53400';
  end if;
  return new;
end;
$$;

revoke execute on function public.feedback_before_insert() from public, anon, authenticated;

create trigger feedback_before_insert
  before insert on public.feedback
  for each row execute function public.feedback_before_insert();

create or replace function public.admin_feedback(p_status text default null, p_limit int default 100, p_offset int default 0, p_user uuid default null)
returns table (
  id uuid,
  user_id uuid,
  email text,
  kind text,
  message text,
  page text,
  user_agent text,
  status text,
  reply text,
  replied_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select f.id, f.user_id, u.email::text, f.kind, f.message, f.page, f.user_agent, f.status, f.reply,
      f.replied_at, f.created_at, f.updated_at, count(*) over ()
    from public.feedback f
    left join auth.users u on u.id = f.user_id
    where (p_status is null or f.status = p_status)
      and (p_user is null or f.user_id = p_user)
    order by f.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_feedback(text, int, int, uuid) from public, anon;
grant execute on function public.admin_feedback(text, int, int, uuid) to authenticated;

-- Sets a feedback item's status and, optionally, the reply its sender sees.
-- p_reply: null leaves the reply as it is; '' removes it.
create or replace function public.admin_update_feedback(p_id uuid, p_status text, p_reply text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_reply text := nullif(btrim(p_reply), '');
begin
  perform public.assert_admin();
  update public.feedback f
  set status = p_status,
      reply = case when p_reply is null then f.reply else v_reply end,
      replied_at = case
        when p_reply is null then f.replied_at
        when v_reply is null then null
        when v_reply is distinct from f.reply then now()
        else f.replied_at
      end,
      updated_at = now()
  where f.id = p_id
  returning f.user_id into v_user;
  if not found then
    raise exception 'no such feedback' using errcode = 'P0002';
  end if;
  perform public.admin_log('feedback.update', v_user,
    jsonb_build_object('feedback_id', p_id, 'status', p_status, 'replied', p_reply is not null and v_reply is not null));
end;
$$;

revoke execute on function public.admin_update_feedback(uuid, text, text) from public, anon;
grant execute on function public.admin_update_feedback(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Users

create or replace function public.admin_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  last_active date,
  letters bigint,
  photos bigint,
  countdowns bigint,
  feedback bigint,
  is_admin boolean,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(p_search), '');
begin
  perform public.assert_admin();
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at, u.banned_until,
      (select max(d.day) from public.usage_daily d where d.user_id = u.id),
      (select count(*) from public.letters l where l.user_id = u.id),
      (select count(*) from public.photos p where p.user_id = u.id),
      (select count(*) from public.countdowns c where c.user_id = u.id),
      (select count(*) from public.feedback f where f.user_id = u.id),
      exists (select 1 from public.admins a where a.user_id = u.id),
      count(*) over ()
    from auth.users u
    where v_search is null
      or u.email ilike '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or u.id::text = v_search
    order by u.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_users(text, int, int) from public, anon;
grant execute on function public.admin_users(text, int, int) to authenticated;

-- Everything about one account an admin may see: counts and dates, never letter text or photos.
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
    'last_active', (select max(d.day) from public.usage_daily d where d.user_id = u.id),
    'active_days_30d', (select count(*) from public.usage_daily d where d.user_id = u.id and d.day > public.app_today() - 30),
    'visits_30d', (select coalesce(sum(d.visits), 0) from public.usage_daily d where d.user_id = u.id and d.day > public.app_today() - 30),
    'letters', (select count(*) from public.letters l where l.user_id = u.id),
    'letters_sealed', (select count(*) from public.letters l where l.user_id = u.id and l.unlock_at > now()),
    'letters_encrypted', (select count(*) from public.letters l where l.user_id = u.id and l.encrypted),
    'photos', (select count(*) from public.photos p where p.user_id = u.id and p.media_type = 'image'),
    'videos', (select count(*) from public.photos p where p.user_id = u.id and p.media_type = 'video'),
    'countdowns', (select count(*) from public.countdowns c where c.user_id = u.id),
    'storage_bytes', (
      select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
      from storage.objects o
      where o.bucket_id = 'photos' and (storage.foldername(o.name))[1] = u.id::text
    ),
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

-- Makes someone an admin or takes it away. You can't remove yourself, so there's always one left.
create or replace function public.admin_set_admin(p_user uuid, p_admin boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
  if p_admin then
    insert into public.admins (user_id, added_by) values (p_user, auth.uid()) on conflict (user_id) do nothing;
    if found then
      perform public.admin_log('admin.grant', p_user);
    end if;
  else
    if p_user = auth.uid() then
      raise exception 'you can''t remove your own admin access' using errcode = '22023';
    end if;
    delete from public.admins where user_id = p_user;
    if found then
      perform public.admin_log('admin.revoke', p_user);
    end if;
  end if;
end;
$$;

revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Overview numbers (were public_stats(), shown on the public /stats page).

drop function public.public_stats();

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
    'letters', (select count(*) from public.letters),
    'letters_opened', (select count(*) from public.letters where opened_at is not null),
    'letters_encrypted', (select count(*) from public.letters where encrypted),
    'photos', (select count(*) from public.photos where media_type = 'image'),
    'videos', (select count(*) from public.photos where media_type = 'video'),
    'countdowns', (select count(*) from public.countdowns),
    'storage_bytes', (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects where bucket_id = 'photos'),
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
