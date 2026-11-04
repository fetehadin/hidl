-- Usage tracking for the public /stats page ("hidl in numbers").
--
-- usage_daily has one row per person per day they used the app, with how many times they
-- opened it that day (a visit = one browser session, counted by the app once per tab). It
-- stores nothing about *what* anyone did: no pages, no content, no IP, no device.
--
-- Nobody can read or write the table directly, not even its own rows: the only way in is
-- record_visit() (counts the caller, using the database's clock), and the only way out is
-- public_stats(), which returns totals only, never a row about a person. Deleting an account
-- deletes its usage rows (on delete cascade), like everything else of theirs.

create table public.usage_daily (
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  visits integer not null default 1 check (visits between 1 and 500),
  primary key (day, user_id)
);

alter table public.usage_daily enable row level security;
revoke all on table public.usage_daily from anon, authenticated;

create or replace function public.record_visit()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.usage_daily as u (day, user_id)
  values (public.app_today(), auth.uid())
  on conflict (day, user_id) do update set visits = least(u.visits + 1, 500);
end;
$$;

revoke execute on function public.record_visit() from public, anon;
grant execute on function public.record_visit() to authenticated;

-- Totals for everyone to see (signed in or not). Counts only.
create or replace function public.public_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with today as (select public.app_today() as d),
  days as (
    select g::date as day
    from today, generate_series(today.d - 29, today.d, interval '1 day') as g
  ),
  daily as (
    select days.day,
      count(u.user_id)::int as people,
      coalesce(sum(u.visits), 0)::int as visits
    from days left join public.usage_daily u on u.day = days.day
    group by days.day
  )
  select jsonb_build_object(
    'people', (select count(*) from auth.users),
    'active_today', (select count(*) from public.usage_daily, today where day = today.d),
    'active_7d', (select count(distinct user_id) from public.usage_daily, today where day > today.d - 7),
    'active_30d', (select count(distinct user_id) from public.usage_daily, today where day > today.d - 30),
    'visits_30d', (select coalesce(sum(visits), 0) from public.usage_daily, today where day > today.d - 30),
    'letters', (select count(*) from public.letters),
    'letters_opened', (select count(*) from public.letters where opened_at is not null),
    'photos', (select count(*) from public.photos where media_type = 'image'),
    'videos', (select count(*) from public.photos where media_type = 'video'),
    'countdowns', (select count(*) from public.countdowns),
    'daily', (select jsonb_agg(jsonb_build_object('day', day, 'people', people, 'visits', visits) order by day) from daily)
  );
$$;

revoke execute on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
