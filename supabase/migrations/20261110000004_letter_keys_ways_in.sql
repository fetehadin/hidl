-- More ways into letters, still end-to-end encrypted (src/lib/e2ee.ts has the formats).
--
-- Writing no longer needs anything unlocked: each person gets a key pair. The public half is
-- stored as is and new letters are encrypted to it ("e2e2." bodies); the private half is stored
-- encrypted with the letter key, so reading still needs the letter key.
--
-- The letter key gets two new ways in, next to the passphrase (now optional) and the old
-- recovery key:
--   email key  the letter key wrapped by HKDF(email half ‖ server half). The email half is sent
--              to the person by email and never stored here; the server half is `email_share`.
--              Neither half alone opens anything.
--   passkeys   letter_passkeys: the letter key wrapped by a passkey's PRF secret (fingerprint /
--              Face ID). Nothing here can produce that secret.

alter table public.letter_keys
  alter column kdf_salt drop not null,
  alter column kdf_iterations drop not null,
  alter column passphrase_wrapped_key drop not null,
  alter column recovery_wrapped_key drop not null,
  add column public_key text check (public_key ~ '^[A-Za-z0-9+/]{87}=$'),
  add column private_key_wrapped text check (
    char_length(private_key_wrapped) between 80 and 600 and private_key_wrapped ~ '^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$'
  ),
  add column email_wrapped_key text check (email_wrapped_key ~ '^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{64}$'),
  add column email_share text check (email_share ~ '^[A-Za-z0-9+/]{43}=$'),
  -- A passphrase comes with its salt and iterations, or not at all.
  add constraint letter_keys_passphrase_whole check (
    (kdf_salt is null) = (passphrase_wrapped_key is null) and (kdf_iterations is null) = (passphrase_wrapped_key is null)
  ),
  add constraint letter_keys_pair_whole check ((public_key is null) = (private_key_wrapped is null)),
  add constraint letter_keys_email_whole check ((email_wrapped_key is null) = (email_share is null)),
  -- Always at least one way in, or the letters could never be opened.
  add constraint letter_keys_has_way_in check (
    passphrase_wrapped_key is not null or email_wrapped_key is not null or recovery_wrapped_key is not null
  );

revoke all on table public.letter_keys from anon, authenticated;
grant select on table public.letter_keys to authenticated;
grant insert (kdf_salt, kdf_iterations, passphrase_wrapped_key, recovery_wrapped_key, public_key, private_key_wrapped,
  email_wrapped_key, email_share) on table public.letter_keys to authenticated;
grant update (kdf_salt, kdf_iterations, passphrase_wrapped_key, public_key, private_key_wrapped, email_wrapped_key,
  email_share) on table public.letter_keys to authenticated;

-- The key pair is set once: replacing it would make every letter written to the old public key
-- unreadable. (Accounts from before this migration get theirs on their next unlock.)
create or replace function public.letter_keys_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.public_key is not null
    and (new.public_key is distinct from old.public_key or new.private_key_wrapped is distinct from old.private_key_wrapped) then
    raise exception 'the letter key pair cannot be replaced' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger letter_keys_guard
  before update on public.letter_keys
  for each row execute function public.letter_keys_guard();

revoke execute on function public.letter_keys_guard() from public, anon, authenticated;

-- Letters: the new body format next to the old one.
alter table public.letters drop constraint letters_body_check;
alter table public.letters add constraint letters_body_check check (
  case when encrypted
    then char_length(body) <= 210000 and (
      body ~ '^e2e1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$'
      or body ~ '^e2e2\.[A-Za-z0-9+/]{87}=\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$'
    )
    else char_length(body) between 1 and 50000
  end
);

-- Passkeys that unlock letters: one row per passkey, the letter key wrapped by its PRF secret.
create table public.letter_passkeys (
  -- Postgres regexes repeat at most 255 times, so the length is checked separately.
  credential_id text primary key check (char_length(credential_id) between 16 and 1400 and credential_id ~ '^[A-Za-z0-9_-]+$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  wrapped_key text not null check (wrapped_key ~ '^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{64}$'),
  created_at timestamptz not null default now()
);

create index letter_passkeys_user on public.letter_passkeys (user_id);

alter table public.letter_passkeys enable row level security;

create policy "letter_passkeys: read own" on public.letter_passkeys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "letter_passkeys: insert own" on public.letter_passkeys
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "letter_passkeys: delete own" on public.letter_passkeys
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.letter_passkeys from anon, authenticated;
grant select (credential_id, wrapped_key, created_at), delete on table public.letter_passkeys to authenticated;
grant insert (credential_id, wrapped_key) on table public.letter_passkeys to authenticated;

-- At most 10 per person: each one is a way in, so they shouldn't pile up unnoticed.
-- security definer: counting reads user_id, which people can't select.
create or replace function public.letter_passkeys_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  if (select count(*) from public.letter_passkeys where user_id = new.user_id) >= 10 then
    raise exception 'too many passkeys' using errcode = '53400';
  end if;
  return new;
end;
$$;

create trigger letter_passkeys_limit
  before insert on public.letter_passkeys
  for each row execute function public.letter_passkeys_limit();

revoke execute on function public.letter_passkeys_limit() from public, anon, authenticated;
