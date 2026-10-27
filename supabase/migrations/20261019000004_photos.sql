-- Senior-year image calendar: at most one photo per user per calendar day.
-- `date` is the local day in Africa/Addis_Ababa.

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  image_path text not null,
  thumb_path text not null,
  caption text check (caption is null or char_length(caption) <= 140),
  created_at timestamptz not null default now(),
  constraint photos_one_per_day unique (user_id, date),
  -- Files must live in the owner's folder of the bucket.
  constraint photos_paths_in_user_folder check (
    image_path like user_id::text || '/%' and thumb_path like user_id::text || '/%'
  )
);

alter table public.photos enable row level security;

create policy "photos: read own" on public.photos
  for select to authenticated using (user_id = (select auth.uid()));
create policy "photos: insert own" on public.photos
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "photos: update own" on public.photos
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "photos: delete own" on public.photos
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.photos from anon, authenticated;
grant select, delete on table public.photos to authenticated;
grant insert (date, image_path, thumb_path, caption) on table public.photos to authenticated;
grant update (image_path, thumb_path, caption) on table public.photos to authenticated;

-- No photos for days that haven't happened yet (judged by the database clock).
create or replace function public.photos_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date > public.app_today() then
    raise exception 'you can''t add a photo for a future day' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger photos_before_write
  before insert or update on public.photos
  for each row execute function public.photos_before_write();

revoke execute on function public.photos_before_write() from public, anon, authenticated;

-- Private bucket. Objects are stored as <user_id>/<date>-<random>[-thumb].<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "photos bucket: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos bucket: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos bucket: update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos bucket: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
