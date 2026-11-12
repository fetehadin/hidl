-- The streak counts only days that were captured on the day (or kept by a streak freeze), the
-- same days that earn streak XP in xp_by_day(). Filling in past days still saves the photos, but
-- doesn't start, lengthen or bring back a streak.
--
-- my_streak() now also returns the streak itself (`streak`, `today_done`) and `has_photos`, so
-- Today no longer loads 400 days of photo dates to count it in the app. Freezes are spent on the
-- gap after the last on-time (or frozen) day, as before.

create or replace function public.my_streak()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_today date;
  v_last date;
  v_gap int;
  v_unused int;
  v_earned int;
  v_spent int;
  v_used_now int := 0;
  v_today_done boolean;
  v_streak int;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('streak:' || v_uid::text, 0));
  v_tz := coalesce((select s.time_zone from public.user_settings s where s.user_id = v_uid), 'Africa/Addis_Ababa');
  v_today := (now() at time zone v_tz)::date;

  -- The last day before today that carries the streak: a photo added on its own day, or a freeze.
  select max(d) into v_last from (
    select p.date as d from public.photos p
    where p.user_id = v_uid and p.date < v_today and (p.created_at at time zone v_tz)::date = p.date
    union all
    select f.used_on from public.streak_freezes f where f.user_id = v_uid and f.used_on < v_today
  ) days;

  if v_last is not null then
    v_gap := (v_today - 1) - v_last;
    select count(*) into v_unused from public.streak_freezes f where f.user_id = v_uid and f.used_on is null;
    if v_gap between 1 and v_unused then
      -- Oldest freezes first, one per missed day.
      with missed as (
        select (v_last + g)::date as day, row_number() over (order by g) as n
        from generate_series(1, v_gap) g
      ),
      spare as (
        select f.id, row_number() over (order by f.bought_at, f.id) as n
        from public.streak_freezes f
        where f.user_id = v_uid and f.used_on is null
      )
      update public.streak_freezes f
      set used_on = m.day
      from spare s
      join missed m on m.n = s.n
      where f.id = s.id;
      v_used_now := v_gap;
    end if;
  end if;

  -- The streak: the run of covered days ending today, or yesterday while today is still open.
  v_today_done := exists (
    select 1 from public.photos p
    where p.user_id = v_uid and p.date = v_today and (p.created_at at time zone v_tz)::date = p.date
  );
  with covered as (
    select p.date as d from public.photos p
    where p.user_id = v_uid and p.date <= v_today and (p.created_at at time zone v_tz)::date = p.date
    union
    select f.used_on from public.streak_freezes f
    where f.user_id = v_uid and f.used_on is not null and f.used_on <= v_today
  ),
  islands as (
    select c.d, c.d - (row_number() over (order by c.d))::int as grp from covered c
  )
  select count(*)::int into v_streak
  from islands i
  where i.grp = (
    select i2.grp from islands i2
    where i2.d = case when v_today_done then v_today else v_today - 1 end
  );

  select coalesce(sum(x.xp), 0)::int into v_earned from public.xp_by_day('2000-01-01', v_today, v_uid) x;
  select coalesce(sum(f.cost), 0)::int into v_spent from public.streak_freezes f where f.user_id = v_uid;

  return jsonb_build_object(
    'streak', v_streak,
    'today_done', v_today_done,
    'has_photos', exists (select 1 from public.photos p where p.user_id = v_uid),
    'xp_balance', v_earned - v_spent,
    'xp_today', (select coalesce(sum(x.xp), 0) from public.xp_by_day(v_today, v_today, v_uid) x),
    'freezes', (select count(*) from public.streak_freezes f where f.user_id = v_uid and f.used_on is null),
    'freeze_max', public.xp_freeze_max(),
    'freeze_cost', public.xp_freeze_cost(),
    'used_now', v_used_now,
    'frozen_days', coalesce((
      select jsonb_agg(f.used_on order by f.used_on)
      from public.streak_freezes f
      where f.user_id = v_uid and f.used_on > v_today - 400
    ), '[]'::jsonb)
  );
end;
$$;
