-- Time-locked letters.
--
-- How the lock is enforced (all in the database, independent of the app):
--   1. Column privileges: `authenticated` can SELECT every column EXCEPT `body`.
--      Any query that touches body (select=*, select=body, filters on body) fails
--      with "permission denied".
--   2. The only way to read a body is public.open_letter(id), a SECURITY DEFINER
--      function that checks ownership and the database clock (now() >= unlock_at).
--   3. Triggers make letters immutable once sealed: only unlock_at may change, and
--      only to a later time while the letter is still sealed.

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 50000),
  recipient text not null check (char_length(recipient) between 1 and 60),
  occasion text check (occasion is null or char_length(occasion) between 1 and 80),
  unlock_at timestamptz not null,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  unlock_email_sent_at timestamptz
);

create index letters_user_unlock_idx on public.letters (user_id, unlock_at);
create index letters_pending_email_idx on public.letters (unlock_at)
  where unlock_email_sent_at is null;

alter table public.letters enable row level security;

create policy "letters: read own" on public.letters
  for select to authenticated using (user_id = (select auth.uid()));
create policy "letters: insert own" on public.letters
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "letters: update own" on public.letters
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "letters: delete own" on public.letters
  for delete to authenticated using (user_id = (select auth.uid()));

-- Column-level privileges. Note: no SELECT on body.
revoke all on table public.letters from anon, authenticated;
grant select (id, user_id, title, recipient, occasion, unlock_at, created_at, opened_at)
  on table public.letters to authenticated;
grant insert (title, body, recipient, occasion, unlock_at) on table public.letters to authenticated;
grant update (unlock_at) on table public.letters to authenticated;
grant delete on table public.letters to authenticated;

-- Insert: the unlock time must be in the future; server-owned columns are forced.
create or replace function public.letters_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.unlock_at <= now() then
    raise exception 'unlock_at must be in the future' using errcode = '22023';
  end if;
  new.created_at := now();
  new.opened_at := null;
  new.unlock_email_sent_at := null;
  return new;
end;
$$;

create trigger letters_before_insert
  before insert on public.letters
  for each row execute function public.letters_before_insert();

-- Update: a sealed letter's contents never change; its date may only move later.
create or replace function public.letters_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.recipient is distinct from old.recipient
    or new.occasion is distinct from old.occasion
    or new.created_at is distinct from old.created_at then
    raise exception 'sealed letters cannot be edited' using errcode = '42501';
  end if;

  if new.unlock_at is distinct from old.unlock_at then
    if old.unlock_at <= now() then
      raise exception 'this letter has already unlocked' using errcode = '22023';
    end if;
    if new.unlock_at < old.unlock_at then
      raise exception 'the unlock date can only move later' using errcode = '22023';
    end if;
  end if;

  if new.opened_at is distinct from old.opened_at then
    if old.opened_at is not null or now() < old.unlock_at then
      raise exception 'opened_at cannot be changed' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger letters_before_update
  before update on public.letters
  for each row execute function public.letters_before_update();

-- The single read path for a letter body.
create or replace function public.open_letter(letter_id uuid)
returns table (
  id uuid,
  title text,
  body text,
  recipient text,
  occasion text,
  unlock_at timestamptz,
  created_at timestamptz,
  opened_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.letters%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into l from public.letters where letters.id = letter_id and letters.user_id = auth.uid();
  if not found then
    raise exception 'letter not found' using errcode = 'P0002';
  end if;

  if now() < l.unlock_at then
    raise exception 'letter is still sealed' using errcode = '42501', hint = 'sealed';
  end if;

  if l.opened_at is null then
    update public.letters set opened_at = now() where letters.id = l.id
    returning letters.opened_at into l.opened_at;
  end if;

  return query select l.id, l.title, l.body, l.recipient, l.occasion, l.unlock_at, l.created_at, l.opened_at;
end;
$$;

revoke execute on function public.open_letter(uuid) from public, anon;
grant execute on function public.open_letter(uuid) to authenticated;
revoke execute on function public.letters_before_insert() from public, anon, authenticated;
revoke execute on function public.letters_before_update() from public, anon, authenticated;
