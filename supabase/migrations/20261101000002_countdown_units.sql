-- How each countdown shows the time left: any non-empty combination of years, months,
-- days and hours (e.g. just days, months + days, or years + months + days + hours).
-- Display only; the target instant is unchanged. Existing countdowns get the default
-- years / months / days.

create or replace function public.countdown_units_ok(units text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select units is not null
    and cardinality(units) between 1 and 4
    and units <@ array['years', 'months', 'days', 'hours']
    and cardinality(units) = (select count(distinct u) from unnest(units) as u);
$$;

alter table public.countdowns
  add column units text[] not null default array['years', 'months', 'days'];
alter table public.countdowns
  add constraint countdowns_units_check check (public.countdown_units_ok(units));

grant insert (units) on table public.countdowns to authenticated;
grant update (units) on table public.countdowns to authenticated;
