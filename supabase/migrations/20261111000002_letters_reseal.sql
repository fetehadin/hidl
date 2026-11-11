-- Re-sealing a letter's body, in exactly two cases. Everywhere else a letter's contents stay
-- immutable (letters_before_update).
--
--   1. reseal_opened_letter(id, body): an end-to-end letter (encrypted = true) that its owner has
--      already opened moves to the server-sealed kind. The owner's browser decrypts it, hidl's
--      server seals the text (src/lib/letter-crypto.ts), and from then on it opens like every new
--      letter, with no fingerprint or emailed key. Only the owner, only once, and only after the
--      letter's date (opened_at is set by open_letter, which checks the clock), so it can never
--      be used to read or change a letter that's still sealed.
--   2. rotate_letter_body(id, old, new): the server changes LETTER_SECRET_KEY and re-encrypts
--      server-sealed bodies under the new key (scripts/rotate-letter-key.mjs). Service role only,
--      srv1 to srv1, and only if the body is still the one the script read.
--
-- Both tell the trigger which letter they're changing through a transaction-local setting.
-- Nobody can set it over the API (PostgREST exposes no way to run SET or set_config).

create or replace function public.letters_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resealing boolean := current_setting('hidl.reseal_letter', true) = old.id::text;
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.title is distinct from old.title
    or (new.body is distinct from old.body and not resealing)
    or (new.encrypted is distinct from old.encrypted and not resealing)
    or new.recipient is distinct from old.recipient
    or new.occasion is distinct from old.occasion
    or new.created_at is distinct from old.created_at then
    raise exception 'sealed letters cannot be edited' using errcode = '42501';
  end if;

  if new.unlock_at is distinct from old.unlock_at then
    if old.unlock_at <= now() then
      raise exception 'this letter has already unlocked' using errcode = '22023';
    end if;
    if new.unlock_at <= now() then
      raise exception 'the new date must be in the future' using errcode = '22023';
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

create or replace function public.reseal_opened_letter(letter_id uuid, new_body text)
returns void
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
  select * into l from public.letters where letters.id = letter_id and letters.user_id = auth.uid() for update;
  if not found then
    raise exception 'letter not found' using errcode = 'P0002';
  end if;
  if not l.encrypted or l.opened_at is null then
    raise exception 'only an opened end-to-end letter can be resealed' using errcode = '42501';
  end if;
  if new_body !~ '^srv1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'the new body must be sealed by the server' using errcode = '22023';
  end if;

  perform set_config('hidl.reseal_letter', l.id::text, true);
  update public.letters set body = new_body, encrypted = false where letters.id = l.id;
  perform set_config('hidl.reseal_letter', '', true);
end;
$$;

revoke execute on function public.reseal_opened_letter(uuid, text) from public, anon;
grant execute on function public.reseal_opened_letter(uuid, text) to authenticated;

create or replace function public.rotate_letter_body(letter_id uuid, old_body text, new_body text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.letters%rowtype;
begin
  if new_body !~ '^srv1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'the new body must be sealed by the server' using errcode = '22023';
  end if;
  select * into l from public.letters where letters.id = letter_id for update;
  -- Gone, already rotated, or not a server-sealed letter: nothing to do.
  if not found or l.encrypted or l.body is distinct from old_body or l.body not like 'srv1.%' then
    return false;
  end if;

  perform set_config('hidl.reseal_letter', l.id::text, true);
  update public.letters set body = new_body where letters.id = l.id;
  perform set_config('hidl.reseal_letter', '', true);
  return true;
end;
$$;

revoke execute on function public.rotate_letter_body(uuid, text, text) from public, anon, authenticated;
grant execute on function public.rotate_letter_body(uuid, text, text) to service_role;
