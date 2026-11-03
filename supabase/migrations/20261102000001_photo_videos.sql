-- Short videos in the calendar, alongside photos.
--
-- A video is a `photos` row with media_type = 'video': image_path points at the video file
-- (.mp4 / .webm / .mov, uploaded as-is, not re-encoded) and thumb_path at a still frame the
-- browser grabbed from it (.webp / .jpg), so every thumbnail view keeps working unchanged.
--
-- The 5 MB cap is the bucket's file_size_limit (5242880 bytes, set in ..._photos.sql),
-- enforced by Storage on every upload, so it covers videos as well as images. The app also
-- checks it in the browser first, only to give a friendlier message.

alter table public.photos
  add column media_type text not null default 'image' check (media_type in ('image', 'video'));

-- The file has to match what the row says it is: a video row points at a video file and an
-- image row at an image; the thumbnail is always an image.
alter table public.photos add constraint photos_media_matches_path check (
  thumb_path ~ '-thumb\.(webp|jpg)$'
  and case media_type
    when 'video' then image_path ~ '\.(mp4|webm|mov)$'
    else image_path ~ '\.(webp|jpg)$'
  end
);

grant insert (media_type) on table public.photos to authenticated;
grant update (media_type) on table public.photos to authenticated;

update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
  where id = 'photos';
