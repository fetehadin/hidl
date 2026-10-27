-- hidl: shared helpers.
-- Convention: timestamps are timestamptz (stored as UTC); calendar days are `date`
-- interpreted in the app timezone (Africa/Addis_Ababa). Every table gets RLS.

-- The user's current calendar day, computed with the database clock.
create or replace function public.app_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Africa/Addis_Ababa')::date;
$$;

comment on function public.app_today() is
  'Current calendar date in Africa/Addis_Ababa, from the database clock.';

-- Don't let new functions be callable by anon by default; grant explicitly instead.
alter default privileges in schema public revoke execute on functions from public, anon;
