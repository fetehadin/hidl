-- Two admin levels: "admin" and "super".
--
-- Regular admins see the numbers, analytics and audit log and answer feedback. Only super admins
-- may act on accounts: suspend or unsuspend, delete, and give or take admin access (and roles).
-- As before, the database decides: the account actions go through admin_log() first, which now
-- refuses non-super admins before the app ever touches the service-role client, and admin
-- access changes go through admin_set_role(). A super admin can't change their own role, so
-- there is always at least one. The first super admin comes from SUPER_ADMIN_EMAIL (README).

alter table public.admins
  add column role text not null default 'admin' check (role in ('admin', 'super'));

-- The caller's admin role ('admin', 'super') or null. Safe for anyone signed in to ask about themselves.
create or replace function public.my_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.admins where user_id = auth.uid();
$$;

revoke execute on function public.my_admin_role() from public, anon;
grant execute on function public.my_admin_role() to authenticated;

-- Internal guard for the actions only super admins may take. Not executable by API roles.
create or replace function public.assert_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.my_admin_role(), '') <> 'super' then
    raise exception 'super admins only' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assert_super_admin() from public, anon, authenticated;

-- Same as before, plus: suspending, unsuspending and deleting accounts need a super admin.
-- The app logs these before calling the Auth admin API, so this is where they're refused.
create or replace function public.admin_log(p_action text, p_target uuid default null, p_details jsonb default '{}')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_action in ('user.suspend', 'user.unsuspend', 'user.delete') then
    perform public.assert_super_admin();
  end if;
  insert into public.admin_audit (admin_id, admin_email, action, target_user, target_email, details)
  values (
    auth.uid(),
    coalesce((select email from auth.users where id = auth.uid()), ''),
    p_action,
    p_target,
    (select email from auth.users where id = p_target),
    coalesce(p_details, '{}')
  );
end;
$$;

-- Gives someone admin access at a level, changes it, or (p_role null) takes it away. Super admins
-- only; nobody can change their own role, so a super admin can't lock everyone out by accident.
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform public.assert_super_admin();
  if p_role is not null and p_role not in ('admin', 'super') then
    raise exception 'unknown admin role' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
  if p_user = auth.uid() then
    raise exception 'you can''t change your own admin access' using errcode = '22023';
  end if;

  select role into v_old from public.admins where user_id = p_user;
  if p_role is null then
    if v_old is not null then
      delete from public.admins where user_id = p_user;
      perform public.admin_log('admin.revoke', p_user, jsonb_build_object('role', v_old));
    end if;
  elsif v_old is null then
    insert into public.admins (user_id, added_by, role) values (p_user, auth.uid(), p_role);
    perform public.admin_log('admin.grant', p_user, jsonb_build_object('role', p_role));
  elsif v_old <> p_role then
    update public.admins set role = p_role where user_id = p_user;
    perform public.admin_log('admin.role', p_user, jsonb_build_object('from', v_old, 'to', p_role));
  end if;
end;
$$;

revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- The old on/off switch, kept for anything still calling it: now super admins only, and turning
-- it on never lowers a super admin to a regular one.
create or replace function public.admin_set_admin(p_user uuid, p_admin boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.assert_super_admin();
  if p_admin then
    if not exists (select 1 from public.admins where user_id = p_user) then
      perform public.admin_set_role(p_user, 'admin');
    end if;
  else
    perform public.admin_set_role(p_user, null);
  end if;
end;
$$;

-- Everything about one account an admin may see: counts and dates, never letter text or photos.
create or replace function public.admin_user_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed_at', u.email_confirmed_at,
    'banned_until', u.banned_until,
    'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
    'calendar', u.raw_user_meta_data ->> 'calendar',
    'time_zone', (select s.time_zone from public.user_settings s where s.user_id = u.id),
    'is_admin', exists (select 1 from public.admins a where a.user_id = u.id),
    'admin_role', (select a.role from public.admins a where a.user_id = u.id),
    'last_active', (select max(d.day) from public.usage_daily d where d.user_id = u.id),
    'active_days_30d', (select count(*) from public.usage_daily d where d.user_id = u.id and d.day > public.app_today() - 30),
    'visits_30d', (select coalesce(sum(d.visits), 0) from public.usage_daily d where d.user_id = u.id and d.day > public.app_today() - 30),
    'letters', (select count(*) from public.letters l where l.user_id = u.id),
    'letters_sealed', (select count(*) from public.letters l where l.user_id = u.id and l.unlock_at > now()),
    'letters_encrypted', (select count(*) from public.letters l where l.user_id = u.id and l.encrypted),
    'photos', (select count(*) from public.photos p where p.user_id = u.id and p.media_type = 'image'),
    'videos', (select count(*) from public.photos p where p.user_id = u.id and p.media_type = 'video'),
    'countdowns', (select count(*) from public.countdowns c where c.user_id = u.id),
    'storage_bytes', (
      select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
      from storage.objects o
      where o.bucket_id = 'photos' and (storage.foldername(o.name))[1] = u.id::text
    ),
    'has_letter_key', exists (select 1 from public.letter_keys k where k.user_id = u.id)
  )
  into v
  from auth.users u
  where u.id = p_id;
  return v;
end;
$$;

revoke execute on function public.admin_user_detail(uuid) from public, anon;
grant execute on function public.admin_user_detail(uuid) to authenticated;
