-- Generalizes the single per-user "exam" into any number of named countdowns, some with
-- exam scores and some bare deadlines. Exactly one may be flagged for the widget feed
-- (enforced by a partial unique index, not app code). The widget token moves to its own
-- table since it's no longer naturally tied to a single countdown row.

create table public.countdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('exam', 'deadline')),
  title text not null check (char_length(title) between 1 and 80),
  target_at timestamptz not null,
  target_score integer,
  max_score integer,
  actual_score integer,
  is_widget boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'exam' and target_score is not null and max_score is not null and target_score between 0 and max_score)
    or
    (kind = 'deadline' and target_score is null and max_score is null and actual_score is null)
  ),
  check (actual_score is null or max_score is null or actual_score between 0 and max_score)
);

create index countdowns_user_target_idx on public.countdowns (user_id, target_at);
-- At most one countdown per user may feed the widget.
create unique index countdowns_one_widget_per_user on public.countdowns (user_id) where is_widget;

alter table public.countdowns enable row level security;

create policy "countdowns: read own" on public.countdowns
  for select to authenticated using (user_id = (select auth.uid()));
create policy "countdowns: insert own" on public.countdowns
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "countdowns: update own" on public.countdowns
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "countdowns: delete own" on public.countdowns
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.countdowns from anon, authenticated;
grant select, delete on table public.countdowns to authenticated;
grant insert (kind, title, target_at, target_score, max_score) on table public.countdowns to authenticated;
-- kind is immutable after creation: changing it would change which fields are meaningful.
grant update (title, target_at, target_score, max_score, actual_score, is_widget) on table public.countdowns to authenticated;

create or replace function public.countdowns_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.actual_score is not null and now() < new.target_at then
    raise exception 'you can enter your score after the deadline' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger countdowns_before_write
  before insert or update on public.countdowns
  for each row execute function public.countdowns_before_write();

revoke execute on function public.countdowns_before_write() from public, anon, authenticated;

-- Selecting exactly one countdown as the widget's and clearing any previous choice must
-- happen atomically, or the partial unique index above could reject the new choice before
-- the old one is cleared.
create or replace function public.set_widget_countdown(countdown_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.countdowns set is_widget = false
    where user_id = auth.uid() and is_widget and id <> countdown_id;
  update public.countdowns set is_widget = true
    where id = countdown_id and user_id = auth.uid();
end;
$$;

grant execute on function public.set_widget_countdown(uuid) to authenticated;

-- A per-user widget-feed token. Only the hash is stored; see src/actions/countdowns.ts.
create table public.widget_tokens (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.widget_tokens enable row level security;

create policy "widget_tokens: read own" on public.widget_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "widget_tokens: insert own" on public.widget_tokens
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "widget_tokens: update own" on public.widget_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "widget_tokens: delete own" on public.widget_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.widget_tokens from anon, authenticated;
-- token_hash is never selectable, even by its owner — same pattern as letters.body.
grant select (user_id, created_at) on table public.widget_tokens to authenticated;
grant insert (token_hash) on table public.widget_tokens to authenticated;
grant update (token_hash) on table public.widget_tokens to authenticated;
grant delete on table public.widget_tokens to authenticated;

-- Migrate existing single-exam data into the new shape, then drop the old table.
insert into public.countdowns (user_id, kind, title, target_at, target_score, max_score, actual_score, is_widget, created_at, updated_at)
select user_id, 'exam', exam_name, exam_at, target_score, max_score, actual_score,
  (widget_token_hash is not null), updated_at, updated_at
from public.exam_settings;

insert into public.widget_tokens (user_id, token_hash, created_at)
select user_id, widget_token_hash, coalesce(widget_token_created_at, now())
from public.exam_settings
where widget_token_hash is not null;

drop table public.exam_settings;
