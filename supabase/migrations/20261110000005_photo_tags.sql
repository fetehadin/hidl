-- What a photo shows ("kinds"), so the memories board can group photos by kind as well as by day.
-- A fixed list, mirrored in src/lib/photo-tags.ts (PHOTO_TAGS, MAX_PHOTO_TAGS): change both together.
-- A photo can have none (not sorted yet) or a few; the order is whatever the person picked.

create or replace function public.photo_tags_ok(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select tags is not null
    and cardinality(tags) <= 4
    and (cardinality(tags) = 0 or array_ndims(tags) = 1)
    and array_position(tags, null) is null
    and tags <@ array['nature', 'places', 'family', 'friends', 'food', 'pets', 'celebrations', 'me']::text[]
    and (select count(distinct t) from unnest(tags) as t) = cardinality(tags)
$$;

alter table public.photos add column tags text[] not null default '{}';
alter table public.photos add constraint photos_tags_ok check (public.photo_tags_ok(tags));

grant insert (tags) on table public.photos to authenticated;
grant update (tags) on table public.photos to authenticated;
