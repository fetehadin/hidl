-- A row per user for things the app shows on every page, starting with their avatar (the
-- Hidi-style buddy built on /account). It used to live in user_metadata, read from the login
-- token's claims, which only updates when the session refreshes: a save could land in the
-- database while the menu kept showing the old buddy. A table is read fresh on every request.
--
-- No row means the user hasn't made a buddy yet, and the app shows Hidi.

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  avatar jsonb not null,
  updated_at timestamptz not null default now()
);

-- Mirrors AVATAR_PARTS in src/lib/avatar.ts: exactly these six keys, each a known option.
create or replace function public.avatar_ok(a jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(a) = 'object'
    and (select array_agg(k order by k) from jsonb_object_keys(a) as k)
        = array['bg', 'extra', 'eyes', 'mouth', 'theme', 'top']
    and a->>'theme' in ('mint', 'sunset', 'berry', 'ocean', 'lemon', 'lavender', 'cocoa', 'cloud')
    and a->>'eyes' in ('round', 'happy', 'sleepy', 'star', 'wink', 'big')
    and a->>'mouth' in ('smile', 'grin', 'o', 'tongue', 'cat', 'flat')
    and a->>'top' in ('sprout', 'bunny', 'cat', 'horns', 'antenna', 'none')
    and a->>'extra' in ('none', 'glasses', 'bow', 'cap', 'headphones', 'flower')
    and a->>'bg' in ('plain', 'dots', 'stars', 'waves', 'hearts');
$$;

alter table public.profiles add constraint profiles_avatar_ok check (public.avatar_ok(avatar));

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "profiles: delete own" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.profiles from anon, authenticated;
grant select, insert (avatar), update (avatar), delete on table public.profiles to authenticated;

create or replace function public.profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

revoke execute on function public.profiles_before_write() from public, anon, authenticated;

-- Carry over buddies already saved the old way.
insert into public.profiles (user_id, avatar)
select id, raw_user_meta_data->'avatar'
from auth.users
where raw_user_meta_data ? 'avatar' and public.avatar_ok(raw_user_meta_data->'avatar')
on conflict (user_id) do nothing;
