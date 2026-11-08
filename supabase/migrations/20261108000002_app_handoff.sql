-- One-time codes that sign the phone app in from an open website tab ("Get a code" on Account,
-- typed into the app). Only a SHA-256 of each code is stored. A code lives 10 minutes, works once,
-- and making a new one retires the old. Nobody reads the table directly: the website creates codes
-- through create_app_handoff() as the signed-in person, and only the server (service role)
-- redeems them through redeem_app_handoff().

create table public.app_handoffs (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz
);
create index app_handoffs_user_created on public.app_handoffs (user_id, created_at);

alter table public.app_handoffs enable row level security;
revoke all on public.app_handoffs from public, anon, authenticated;

create or replace function public.create_app_handoff(p_code_hash text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad code' using errcode = '22023';
  end if;
  delete from public.app_handoffs where user_id = v_uid and created_at < now() - interval '1 day';
  if (select count(*) from public.app_handoffs where user_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many codes' using errcode = '53400';
  end if;
  -- Only the newest code works.
  update public.app_handoffs set used_at = now() where user_id = v_uid and used_at is null;
  insert into public.app_handoffs (code_hash, user_id) values (p_code_hash, v_uid)
  returning expires_at into v_expires;
  return v_expires;
end;
$$;

revoke execute on function public.create_app_handoff(text) from public, anon;
grant execute on function public.create_app_handoff(text) to authenticated;

-- 'ok' with the account, or why not: 'invalid' (no such code), 'used' (already used or replaced
-- by a newer one), 'expired'.
create or replace function public.redeem_app_handoff(p_code_hash text)
returns table (out_user uuid, out_status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.app_handoffs%rowtype;
begin
  select * into r from public.app_handoffs h where h.code_hash = p_code_hash for update;
  if not found then
    return query select null::uuid, 'invalid'::text;
  elsif r.used_at is not null then
    return query select null::uuid, 'used'::text;
  elsif r.expires_at <= now() then
    return query select null::uuid, 'expired'::text;
  else
    update public.app_handoffs h set used_at = now() where h.code_hash = p_code_hash;
    return query select r.user_id, 'ok'::text;
  end if;
end;
$$;

revoke execute on function public.redeem_app_handoff(text) from public, anon, authenticated;
grant execute on function public.redeem_app_handoff(text) to service_role;
