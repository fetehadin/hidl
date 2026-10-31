-- More kinds of countdown (birthday, wedding, work, ...), each with its own small set of
-- details (whose birthday, the couple's names, the role and company, ...). The details
-- live in one jsonb column, but which keys a kind may carry, and their types and lengths,
-- are still checked by Postgres, so the app can't store a stray or oversized field.
-- 'deadline' stays as the stored value for "Other" so existing rows and widget consumers
-- keep working. Scores remain exam-only.

alter table public.countdowns drop constraint countdowns_kind_check;
alter table public.countdowns add constraint countdowns_kind_check
  check (kind in ('exam', 'graduation', 'birthday', 'wedding', 'work', 'trip', 'life', 'deadline'));

alter table public.countdowns drop constraint countdowns_check;
alter table public.countdowns add constraint countdowns_scores_check check (
  (kind = 'exam' and target_score is not null and max_score is not null and target_score between 0 and max_score)
  or
  (kind <> 'exam' and target_score is null and max_score is null and actual_score is null)
);

-- Allowed detail keys per kind. Every value is a short string except birth_year.
create or replace function public.countdown_details_ok(kind text, details jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  allowed text[];
  k text;
  v jsonb;
begin
  if details is null or jsonb_typeof(details) <> 'object' then
    return false;
  end if;

  allowed := case kind
    when 'exam' then array['subject', 'note']
    when 'graduation' then array['school', 'program', 'note']
    when 'birthday' then array['person', 'birth_year', 'note']
    when 'wedding' then array['couple', 'venue', 'note']
    when 'work' then array['role', 'organization', 'note']
    when 'trip' then array['destination', 'companions', 'note']
    when 'life' then array['place', 'note']
    when 'deadline' then array['note']
    else array[]::text[]
  end;

  for k, v in select * from jsonb_each(details) loop
    if not (k = any (allowed)) then
      return false;
    end if;
    if k = 'birth_year' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
        or (v #>> '{}')::numeric not between 1900 and 2100 then
        return false;
      end if;
    elsif jsonb_typeof(v) <> 'string'
      or char_length(v #>> '{}') not between 1 and (case when k = 'note' then 200 else 80 end) then
      return false;
    end if;
  end loop;

  -- A birthday countdown has to say whose it is.
  if kind = 'birthday' and not details ? 'person' then
    return false;
  end if;

  return true;
end;
$$;

alter table public.countdowns add column details jsonb not null default '{}'::jsonb;
alter table public.countdowns add constraint countdowns_details_check check (public.countdown_details_ok(kind, details));

grant insert (details) on table public.countdowns to authenticated;
grant update (details) on table public.countdowns to authenticated;
