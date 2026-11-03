-- Per-user time zones. "Today" and every displayed time used to be Africa/Addis_Ababa for
-- everyone; now each user gets their device's IANA zone, like any global app. The browser
-- reports it (setTimeZone in src/actions/preferences.ts) and it's stored here, so the
-- database's own date rules judge "today" in the user's zone too.
--
-- No row means the device hasn't reported a zone yet: fall back to Africa/Addis_Ababa, which
-- is what every existing row was written under.

-- A zone Postgres knows. Not immutable in theory (the tz database can change), which is
-- fine for a check constraint: names are only ever added, and the app validates them too.
create or replace function public.time_zone_ok(tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select tz is not null
    and char_length(tz) between 1 and 64
    and exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

grant execute on function public.time_zone_ok(text) to authenticated;

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  time_zone text not null check (public.time_zone_ok(time_zone)),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings: read own" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_settings: insert own" on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_settings: update own" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "user_settings: delete own" on public.user_settings
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.user_settings from anon, authenticated;
grant select (user_id, time_zone, updated_at), insert (time_zone), update (time_zone), delete
  on table public.user_settings to authenticated;

create or replace function public.user_settings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_settings_before_write
  before insert or update on public.user_settings
  for each row execute function public.user_settings_before_write();

revoke execute on function public.user_settings_before_write() from public, anon, authenticated;

-- No photos for days that haven't happened yet: still judged by the database clock, but now
-- in the photo owner's own time zone. Runs as the writing user, so RLS limits the lookup to
-- their own settings row (and new.user_id is always theirs: the insert policy checks it).
create or replace function public.photos_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz text;
begin
  select s.time_zone into tz from public.user_settings s where s.user_id = new.user_id;
  if new.date > (now() at time zone coalesce(tz, 'Africa/Addis_Ababa'))::date then
    raise exception 'you can''t add a photo for a future day' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.photos_before_write() from public, anon, authenticated;

comment on function public.app_today() is
  'Current calendar date in Africa/Addis_Ababa, the fallback zone for users with no user_settings row. '
  'Per-user checks use user_settings.time_zone instead.';
