-- Letters: the opening date can now move earlier as well as later. People change their minds
-- ("open it on graduation day, not a year after"), and the only rule that protects a sealed
-- letter is that it can't be read before its date: moving the date earlier, to another moment
-- that's still in the future, doesn't let anyone read it now. What stays forbidden:
--   * changing the date of a letter that has already unlocked (it's been delivered), and
--   * a new date that isn't in the future (that would be "open it now", by the back door).
-- Everything else in letters_before_update is unchanged from ..._letter_encryption.sql.
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
