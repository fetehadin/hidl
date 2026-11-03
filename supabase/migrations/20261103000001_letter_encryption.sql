-- End-to-end encrypted letter text.
--
-- The browser encrypts a letter's body (AES-256-GCM, WebCrypto) before it is sent, with a
-- per-user "letter key" that never reaches the server in usable form. What the server
-- stores (src/lib/e2ee.ts has the formats):
--
--   letter_keys   the letter key, wrapped (encrypted) twice: once with a key derived from
--                 the user's passphrase (PBKDF2-SHA256), once with a random recovery key the
--                 user writes down. Neither the passphrase nor the recovery key is ever sent.
--   letters.body  "e2e1.<iv>.<ciphertext>" when letters.encrypted is true.
--
-- The time lock is unchanged and still enforced here: the ciphertext is just as unreadable
-- through the API before unlock_at (no SELECT on body; open_letter checks the clock), and
-- only after that does the browser get it to decrypt.
--
-- Letters written before this migration keep their plaintext body (encrypted = false):
-- they're sealed and immutable, so they can't be re-encrypted without opening them early.

create table public.letter_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- PBKDF2 parameters for the passphrase-derived wrapping key.
  kdf_salt text not null check (kdf_salt ~ '^[A-Za-z0-9+/]{22}==$'),
  kdf_iterations integer not null check (kdf_iterations between 100000 and 10000000),
  -- "<iv>.<wrapped key>", AES-GCM: the letter key wrapped by the passphrase key / recovery key.
  passphrase_wrapped_key text not null check (passphrase_wrapped_key ~ '^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{64}$'),
  recovery_wrapped_key text not null check (recovery_wrapped_key ~ '^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.letter_keys enable row level security;

create policy "letter_keys: read own" on public.letter_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "letter_keys: insert own" on public.letter_keys
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "letter_keys: update own" on public.letter_keys
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No DELETE: dropping the wrapped key would make every encrypted letter unreadable for good.
-- It goes away with the account (on delete cascade). Changing the passphrase re-wraps the
-- same letter key, so only the passphrase copy (and its salt) is updatable.
revoke all on table public.letter_keys from anon, authenticated;
grant select, insert (kdf_salt, kdf_iterations, passphrase_wrapped_key, recovery_wrapped_key)
  on table public.letter_keys to authenticated;
grant update (kdf_salt, kdf_iterations, passphrase_wrapped_key) on table public.letter_keys to authenticated;

create or replace function public.letter_keys_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger letter_keys_before_write
  before insert or update on public.letter_keys
  for each row execute function public.letter_keys_before_write();

revoke execute on function public.letter_keys_before_write() from public, anon, authenticated;

-- Letters: an `encrypted` flag, and a body limit that fits ciphertext. 50,000 characters of
-- text is at most ~150 KB of UTF-8, which is ~200,000 characters once encrypted and base64'd.
alter table public.letters add column encrypted boolean not null default false;

alter table public.letters drop constraint letters_body_check;
alter table public.letters add constraint letters_body_check check (
  case when encrypted
    then char_length(body) <= 210000 and body ~ '^e2e1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$'
    else char_length(body) between 1 and 50000
  end
);

grant select (encrypted) on table public.letters to authenticated;
grant insert (encrypted) on table public.letters to authenticated;

-- Same as before, plus `encrypted` can never change (it's part of the sealed contents).
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
    or new.encrypted is distinct from old.encrypted
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
