-- The admin overview gains sealed letters, returning people and week-1 retention.
-- Same function as in 20261105000001_admin_and_feedback.sql plus four keys; still counts only.

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
