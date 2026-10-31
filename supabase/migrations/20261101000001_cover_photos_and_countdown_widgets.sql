-- Two additions:
--
-- 1. A pinned "wallpaper" photo per day. When a day has several photos, its owner can pin
--    one to be the picture the calendar (and the dashboard, and the memories board) shows
--    for that day. At most one per day, enforced by a partial unique index; flipping it is
--    done by set_cover_photo() so the old pin is cleared in the same call.
--
-- 2. A widget feed per countdown. Until now a user had one widget token, and it served
--    whichever countdown was starred. A token can now also be tied to one countdown, so a
--    phone can show a separate widget for each. countdown_id null keeps the old meaning
--    ("the starred one"). A composite foreign key makes sure a token can only point at a
--    countdown its own user owns, and deleting the countdown deletes its token.

-- 1. Cover photos

alter table public.photos add column is_cover boolean not null default false;
create unique index photos_one_cover_per_day on public.photos (user_id, date) where is_cover;

-- The app only changes is_cover through this function, which clears the day's old pin
-- first so the index above is never violated.
create or replace function public.set_cover_photo(photo_id uuid, pinned boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  photo_date date;
begin
  select date into photo_date from public.photos where id = photo_id and user_id = auth.uid();
  if photo_date is null then
    raise exception 'photo not found' using errcode = 'P0002';
  end if;
  if pinned then
    update public.photos set is_cover = false
      where user_id = auth.uid() and date = photo_date and is_cover and id <> photo_id;
  end if;
  update public.photos set is_cover = pinned where id = photo_id and user_id = auth.uid();
end;
$$;

-- The function runs as the caller (not SECURITY DEFINER), so RLS still scopes every
-- statement, and the caller needs UPDATE on the column. A direct UPDATE that would give a
-- day two pins is simply rejected by the index.
grant update (is_cover) on table public.photos to authenticated;
grant execute on function public.set_cover_photo(uuid, boolean) to authenticated;

-- 2. One widget token per countdown (plus the existing "starred" one)

alter table public.countdowns add constraint countdowns_id_user_unique unique (id, user_id);

alter table public.widget_tokens drop constraint widget_tokens_pkey;
alter table public.widget_tokens add column id uuid not null default gen_random_uuid() primary key;
alter table public.widget_tokens add column countdown_id uuid;
alter table public.widget_tokens add constraint widget_tokens_countdown_fk
  foreign key (countdown_id, user_id) references public.countdowns (id, user_id) on delete cascade;
-- One starred-feed token (countdown_id null) and one token per countdown, per user.
alter table public.widget_tokens add constraint widget_tokens_one_per_countdown
  unique nulls not distinct (user_id, countdown_id);

grant select (countdown_id) on table public.widget_tokens to authenticated;
grant insert (countdown_id) on table public.widget_tokens to authenticated;
