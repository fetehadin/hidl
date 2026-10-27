-- Entrance exam countdown: one settings row per user.

create table public.exam_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  exam_name text not null check (char_length(exam_name) between 1 and 80),
  exam_at timestamptz not null,
  target_score integer not null,
  max_score integer not null check (max_score between 1 and 100000),
  actual_score integer,
  updated_at timestamptz not null default now(),
  check (target_score between 0 and max_score),
  check (actual_score is null or actual_score between 0 and max_score)
);

alter table public.exam_settings enable row level security;

create policy "exam: read own" on public.exam_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "exam: insert own" on public.exam_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "exam: update own" on public.exam_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "exam: delete own" on public.exam_settings
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.exam_settings from anon, authenticated;
grant select, delete on table public.exam_settings to authenticated;
grant insert (exam_name, exam_at, target_score, max_score, actual_score)
  on table public.exam_settings to authenticated;
grant update (exam_name, exam_at, target_score, max_score, actual_score)
  on table public.exam_settings to authenticated;

-- The actual score can only be recorded once the exam has happened.
create or replace function public.exam_settings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.actual_score is not null and now() < new.exam_at then
    raise exception 'you can enter your score after the exam' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger exam_settings_before_write
  before insert or update on public.exam_settings
  for each row execute function public.exam_settings_before_write();

revoke execute on function public.exam_settings_before_write() from public, anon, authenticated;
