-- Profile pictures are gone: everyone is shown by their buddy. Uploaded pictures lived in the
-- public `avatars` bucket, which can't be private and wouldn't move to the self-hosted media
-- store, so the feature goes rather than the bucket staying around for it.
--
-- Deploy order: the app code that stopped reading picture_path ships first, then this.
-- The bucket's files and the bucket itself are removed with the Storage API
-- (deploy/media/tools/remove-avatars-bucket.mjs): Storage refuses direct deletes from its tables.

-- leaderboard() returns picture_path, so it has to be dropped before the column, and
-- recreated without it (a changed return type can't go through `create or replace`).
drop function public.leaderboard(text, boolean);

alter table public.profiles drop column picture_path;

create function public.leaderboard(p_period text, p_previous boolean default false)
returns table (
  rank int,
  display_name text,
  avatar jsonb,
  streak int,
  photo_days int,
  is_me boolean,
  period_start date,
  period_end date
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_period not in ('week', 'month') then
    raise exception 'unknown period' using errcode = '22023';
  end if;
  v_start := public.leaderboard_period_start(p_period, public.app_today(), case when p_previous then 1 else 0 end);
  v_end := public.leaderboard_period_end(p_period, v_start);

  if not p_previous then
    return query
      select c.rank, pr.display_name, pr.avatar, c.streak, c.photo_days,
        c.user_id = auth.uid(), v_start, v_end
      from public.leaderboard_compute(v_start, v_end) c
      left join public.profiles pr on pr.user_id = c.user_id
      where c.rank <= 50 or c.user_id = auth.uid()
      order by c.rank, pr.display_name nulls last;
    return;
  end if;

  -- Release the finished period once; concurrent first viewers race on the primary key.
  insert into public.leaderboard_releases (period, period_start) values (p_period, v_start)
  on conflict do nothing;
  if found then
    insert into public.leaderboard_results (period, period_start, user_id, rank, streak, photo_days)
    select p_period, v_start, c.user_id, c.rank, c.streak, c.photo_days
    from public.leaderboard_compute(v_start, v_end) c
    where c.rank <= 100;
  end if;

  return query
    select r.rank,
      case when coalesce(pr.show_on_leaderboard, true) then pr.display_name end,
      case when coalesce(pr.show_on_leaderboard, true) then pr.avatar end,
      r.streak, r.photo_days, r.user_id = auth.uid(), v_start, v_end
    from public.leaderboard_results r
    left join public.profiles pr on pr.user_id = r.user_id
    where r.period = p_period and r.period_start = v_start
      and (r.rank <= 50 or r.user_id = auth.uid())
    order by r.rank, pr.display_name nulls last;
end;
$$;

revoke execute on function public.leaderboard(text, boolean) from public, anon;
grant execute on function public.leaderboard(text, boolean) to authenticated;

drop policy "avatars bucket: read own folder" on storage.objects;
drop policy "avatars bucket: upload to own folder" on storage.objects;
drop policy "avatars bucket: update own folder" on storage.objects;
drop policy "avatars bucket: delete own folder" on storage.objects;
