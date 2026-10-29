-- Allow more than one photo per day. Everything else about a photo row
-- (ownership, future-day check, folder check) is still enforced per row.
alter table public.photos drop constraint photos_one_per_day;
