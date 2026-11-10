-- Photo groups: albums each person makes, names and orders themselves ("Family", "Trips",
-- anything), so the memories board can gather photos by group as well as by day. A photo can be
-- in any number of a person's groups. Name rules are mirrored in src/lib/photo-groups.ts
-- (PHOTO_GROUP_NAME_MAX, MAX_PHOTO_GROUPS, groupNameProblem): change both together.

create or replace function public.photo_group_name_ok(name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select name is not null
    and name = btrim(name)
    and char_length(name) between 1 and 30
    and name !~ '[[:cntrl:]]'
$$;

create table public.photo_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null constraint photo_groups_name_ok check (public.photo_group_name_ok(name)),
  -- The person's priority: 0 first. The first group sits in the middle of the memories board.
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  -- For the items' composite foreign key (an item's group must be the same person's).
  constraint photo_groups_id_user unique (id, user_id)
);

create unique index photo_groups_name_unique on public.photo_groups (user_id, lower(name));

-- Photos get the same (id, user_id) key, so an item can only join a person's own photo and group.
alter table public.photos add constraint photos_id_user unique (id, user_id);

create table public.photo_group_items (
  group_id uuid not null,
  photo_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, photo_id),
  foreign key (group_id, user_id) references public.photo_groups (id, user_id) on delete cascade,
  foreign key (photo_id, user_id) references public.photos (id, user_id) on delete cascade
);

create index photo_group_items_photo on public.photo_group_items (photo_id);
create index photo_group_items_user on public.photo_group_items (user_id);

alter table public.photo_groups enable row level security;
alter table public.photo_group_items enable row level security;

create policy "photo_groups: read own" on public.photo_groups
  for select to authenticated using (user_id = (select auth.uid()));
create policy "photo_groups: insert own" on public.photo_groups
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "photo_groups: update own" on public.photo_groups
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "photo_groups: delete own" on public.photo_groups
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "photo_group_items: read own" on public.photo_group_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "photo_group_items: insert own" on public.photo_group_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "photo_group_items: delete own" on public.photo_group_items
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.photo_groups from anon, authenticated;
grant select (id, name, position, created_at) on table public.photo_groups to authenticated;
grant insert (name) on table public.photo_groups to authenticated;
grant update (name, position) on table public.photo_groups to authenticated;
grant delete on table public.photo_groups to authenticated;

revoke all on table public.photo_group_items from anon, authenticated;
-- user_id too: embedding items in a photos query joins on the whole (photo_id, user_id) key.
grant select (group_id, photo_id, user_id) on table public.photo_group_items to authenticated;
grant insert (group_id, photo_id) on table public.photo_group_items to authenticated;
grant delete on table public.photo_group_items to authenticated;

-- New groups go last, and a person has at most 50.
create or replace function public.photo_groups_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing integer;
begin
  -- One insert at a time per person, so two quick inserts can't both slip under the limit.
  perform pg_advisory_xact_lock(hashtextextended('photo_groups:' || new.user_id::text, 0));
  select count(*), coalesce(max(position) + 1, 0) into existing, new.position
    from public.photo_groups where user_id = new.user_id;
  if existing >= 50 then
    raise exception 'too many photo groups' using errcode = '53400';
  end if;
  return new;
end;
$$;

create trigger photo_groups_before_insert
  before insert on public.photo_groups
  for each row execute function public.photo_groups_before_insert();

-- Sets the caller's group order in one statement: `ids` first to last. RLS keeps it to their own.
create or replace function public.set_photo_group_order(ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.photo_groups g
     set position = o.ord - 1
    from unnest(ids) with ordinality as o (id, ord)
   where g.id = o.id;
$$;

-- Puts a photo in exactly these groups (empty = none), in one transaction. Runs as the caller:
-- RLS and the composite keys refuse anyone else's photo or group.
create or replace function public.set_photo_groups(photo uuid, group_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.photo_group_items i
   where i.photo_id = photo and not (i.group_id = any (coalesce(group_ids, '{}')));
  insert into public.photo_group_items (group_id, photo_id)
  select distinct g, photo
    from unnest(coalesce(group_ids, '{}')) as g
   where not exists (select 1 from public.photo_group_items i where i.photo_id = photo and i.group_id = g);
end;
$$;

revoke execute on function public.set_photo_group_order(uuid[]) from public, anon;
revoke execute on function public.set_photo_groups(uuid, uuid[]) from public, anon;
revoke execute on function public.photo_groups_before_insert() from public, anon, authenticated;
grant execute on function public.set_photo_group_order(uuid[]) to authenticated;
grant execute on function public.set_photo_groups(uuid, uuid[]) to authenticated;
