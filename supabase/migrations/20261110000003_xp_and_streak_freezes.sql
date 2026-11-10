-- XP, the XP leaderboard, and streak freezes bought with XP.
--
-- XP is never stored: it's worked out from the photos, letters and countdowns themselves, with
-- timestamps the database sets (users can't write created_at or opened_at). So deleting something
-- takes its XP away, and the daily limits stop creating-and-deleting from farming it. Per day, in
-- the owner's own time zone (user_settings), the rules are (mirrored in src/lib/xp.ts):
--
--   photo on the day it happened ........ 10, once a day
--   more photos that day ................ +2 each, at most 3
--   streak bonus ........................ + the streak's length that day, at most 10
--   write a letter ...................... 15, once a day
--   open a letter on its opening day .... 20 each
--   create a countdown .................. 5, once a day
--
-- Backfilled photos (added on a later day) earn nothing, as before on the leaderboard.
--
-- Streak freezes cost 50 XP (xp_freeze_cost) and someone holds at most 2 (xp_freeze_max). When
-- days are missed, my_streak() spends one freeze per missed day, but only if they have enough to
-- cover the whole gap (otherwise the streak is gone anyway and nothing is wasted). A frozen day
-- keeps the streak going but earns no XP. Spendable XP = everything ever earned - freezes bought.

create function public.xp_freeze_cost()
returns int
language sql
immutable
set search_path = ''
as $$ select 50 $$;

create function public.xp_freeze_max()
returns int
language sql
immutable
set search_path = ''
as $$ select 2 $$;

grant execute on function public.xp_freeze_cost() to authenticated;
grant execute on function public.xp_freeze_max() to authenticated;

create table public.streak_freezes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cost int not null check (cost >= 0),
  bought_at timestamptz not null default now(),
  -- The missed day this freeze covered; null while it's still waiting to be used.
  used_on date,
  constraint streak_freezes_one_per_day unique (user_id, used_on)
);

create index streak_freezes_user on public.streak_freezes (user_id, used_on);

alter table public.streak_freezes enable row level security;
revoke all on table public.streak_freezes from public, anon, authenticated;

-- XP per person per day, for days in [p_from, p_to] (each person's own calendar days).
-- p_user limits it to one person. Internal: called by the functions below only.
create function public.xp_by_day(p_from date, p_to date, p_user uuid default null)
returns table (user_id uuid, day date, xp int)
language sql
stable
security definer
set search_path = ''
as $$
  with zones as (
    select u.id as user_id, coalesce(s.time_zone, 'Africa/Addis_Ababa') as tz
    from auth.users u
    left join public.user_settings s on s.user_id = u.id
    where p_user is null or u.id = p_user
  ),
  -- On-time photos: the day it's for is the day it was added.
  photo_days as (
    select p.user_id, p.date as day, count(*)::int as n
    from public.photos p
    join zones z on z.user_id = p.user_id
    where p.date <= p_to and (p.created_at at time zone z.tz)::date = p.date
    group by p.user_id, p.date
  ),
  -- Days that carry a streak: on-time photo days and days a freeze covered.
  covered as (
    select pd.user_id, pd.day from photo_days pd
    union
    select f.user_id, f.used_on
    from public.streak_freezes f
    join zones z on z.user_id = f.user_id
    where f.used_on is not null and f.used_on <= p_to
  ),
  -- Consecutive days share day - row_number() (gaps and islands); the position in the island is
  -- the streak's length on that day.
  islands as (
    select c.user_id, c.day, c.day - (row_number() over (partition by c.user_id order by c.day))::int as grp
    from covered c
  ),
  streaks as (
    select i.user_id, i.day, (row_number() over (partition by i.user_id, i.grp order by i.day))::int as len
    from islands i
  ),
  earned as (
    select pd.user_id, pd.day, 10 + 2 * least(3, pd.n - 1) + least(10, s.len) as xp
    from photo_days pd
    join streaks s on s.user_id = pd.user_id and s.day = pd.day
    where pd.day >= p_from
    union all
    select l.user_id, (l.created_at at time zone z.tz)::date, 15
    from public.letters l
    join zones z on z.user_id = l.user_id
    where (l.created_at at time zone z.tz)::date between p_from and p_to
    group by l.user_id, (l.created_at at time zone z.tz)::date
    union all
    select l.user_id, (l.opened_at at time zone z.tz)::date, 20 * count(*)::int
    from public.letters l
    join zones z on z.user_id = l.user_id
    where l.opened_at is not null
      and (l.opened_at at time zone z.tz)::date = (l.unlock_at at time zone z.tz)::date
      and (l.opened_at at time zone z.tz)::date between p_from and p_to
    group by l.user_id, (l.opened_at at time zone z.tz)::date
    union all
    select c.user_id, (c.created_at at time zone z.tz)::date, 5
    from public.countdowns c
    join zones z on z.user_id = c.user_id
    where (c.created_at at time zone z.tz)::date between p_from and p_to
    group by c.user_id, (c.created_at at time zone z.tz)::date
  )
  select e.user_id, e.day, sum(e.xp)::int
  from earned e
  group by e.user_id, e.day;
$$;

revoke execute on function public.xp_by_day(date, date, uuid) from public, anon, authenticated;

-- The caller's today, in their own zone.
create function public.my_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select s.time_zone from public.user_settings s where s.user_id = auth.uid()), 'Africa/Addis_Ababa'))::date
$$;

revoke execute on function public.my_today() from public, anon;
grant execute on function public.my_today() to authenticated;

-- The caller's streak state, after spending freezes on any missed days that ended yesterday:
-- XP to spend, XP this week, freezes held, and every day a freeze covered (for the streak row).
-- Volatile on purpose: it may use freezes. Safe to call on every visit.
create function public.my_streak()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date;
  v_last date;
  v_gap int;
  v_unused int;
  v_earned int;
  v_spent int;
  v_used_now int := 0;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('streak:' || v_uid::text, 0));
  v_today := public.my_today();

  -- The last day before today that carries the streak (any photo for that day, or a freeze):
  -- the same days Today's streak counts.
  select max(d) into v_last from (
    select p.date as d from public.photos p where p.user_id = v_uid and p.date < v_today
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

  select coalesce(sum(x.xp), 0)::int into v_earned from public.xp_by_day('2000-01-01', v_today, v_uid) x;
  select coalesce(sum(f.cost), 0)::int into v_spent from public.streak_freezes f where f.user_id = v_uid;

  return jsonb_build_object(
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

revoke execute on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated;

-- Buys one streak freeze. HX001 = not enough XP, HX002 = already holding the most.
create function public.buy_streak_freeze()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_earned int;
  v_spent int;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('streak:' || v_uid::text, 0));
  if (select count(*) from public.streak_freezes f where f.user_id = v_uid and f.used_on is null) >= public.xp_freeze_max() then
    raise exception 'already holding the most freezes' using errcode = 'HX002';
  end if;
  select coalesce(sum(x.xp), 0)::int into v_earned from public.xp_by_day('2000-01-01', public.my_today(), v_uid) x;
  select coalesce(sum(f.cost), 0)::int into v_spent from public.streak_freezes f where f.user_id = v_uid;
  if v_earned - v_spent < public.xp_freeze_cost() then
    raise exception 'not enough XP' using errcode = 'HX001';
  end if;
  insert into public.streak_freezes (user_id, cost) values (v_uid, public.xp_freeze_cost());
end;
$$;

revoke execute on function public.buy_streak_freeze() from public, anon;
grant execute on function public.buy_streak_freeze() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The leaderboard ranks XP now. `streak` is still the longest run of on-time photo days in the
-- period (shown next to the XP), and people with XP but no photos are on the board too.

alter table public.leaderboard_results drop constraint if exists leaderboard_results_streak_check;
alter table public.leaderboard_results add constraint leaderboard_results_streak_check check (streak >= 0);
alter table public.leaderboard_results add column xp int not null default 0 check (xp >= 0);

drop function public.leaderboard_compute(date, date);

create function public.leaderboard_compute(p_start date, p_end date)
returns table (user_id uuid, rank int, xp int, streak int, photo_days int)
language sql
stable
security definer
set search_path = ''
as $$
  with xp as (
    select x.user_id, sum(x.xp)::int as xp from public.xp_by_day(p_start, p_end) x group by x.user_id
  ),
  on_time as (
    select distinct p.user_id, p.date
    from public.photos p
    left join public.user_settings s on s.user_id = p.user_id
    where p.date between p_start and p_end
      and (p.created_at at time zone coalesce(s.time_zone, 'Africa/Addis_Ababa'))::date = p.date
  ),
  islands as (
    select o.user_id, o.date - (row_number() over (partition by o.user_id order by o.date))::int as grp
    from on_time o
  ),
  runs as (
    select i.user_id, count(*)::int as len from islands i group by i.user_id, i.grp
  ),
  streaks as (
    select r.user_id, max(r.len)::int as streak, sum(r.len)::int as photo_days from runs r group by r.user_id
  ),
  scores as (
    select x.user_id, x.xp, coalesce(st.streak, 0) as streak, coalesce(st.photo_days, 0) as photo_days
    from xp x
    left join streaks st on st.user_id = x.user_id
    left join public.profiles pr on pr.user_id = x.user_id
    where x.xp > 0 and coalesce(pr.show_on_leaderboard, true)
  )
  select sc.user_id, (rank() over (order by sc.xp desc, sc.streak desc))::int, sc.xp, sc.streak, sc.photo_days
  from scores sc;
$$;

revoke execute on function public.leaderboard_compute(date, date) from public, anon, authenticated;

-- Periods already released keep their ranks; they gain the XP their days earned.
update public.leaderboard_results r
set xp = coalesce((
  select sum(x.xp) from public.xp_by_day(
    r.period_start, public.leaderboard_period_end(r.period, r.period_start), r.user_id) x
), 0);

drop function public.leaderboard(text, boolean);

create function public.leaderboard(p_period text, p_previous boolean default false)
returns table (
  rank int,
  display_name text,
  avatar jsonb,
  xp int,
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
      select c.rank, pr.display_name, pr.avatar, c.xp, c.streak, c.photo_days,
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
    insert into public.leaderboard_results (period, period_start, user_id, rank, xp, streak, photo_days)
    select p_period, v_start, c.user_id, c.rank, c.xp, c.streak, c.photo_days
    from public.leaderboard_compute(v_start, v_end) c
    where c.rank <= 100;
  end if;

  return query
    select r.rank,
      case when coalesce(pr.show_on_leaderboard, true) then pr.display_name end,
      case when coalesce(pr.show_on_leaderboard, true) then pr.avatar end,
      r.xp, r.streak, r.photo_days, r.user_id = auth.uid(), v_start, v_end
    from public.leaderboard_results r
    left join public.profiles pr on pr.user_id = r.user_id
    where r.period = p_period and r.period_start = v_start
      and (r.rank <= 50 or r.user_id = auth.uid())
    order by r.rank, pr.display_name nulls last;
end;
$$;

revoke execute on function public.leaderboard(text, boolean) from public, anon;
grant execute on function public.leaderboard(text, boolean) to authenticated;
