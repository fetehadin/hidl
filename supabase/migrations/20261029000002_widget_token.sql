-- A per-user token for the home-screen-widget countdown feed (src/app/api/widget/countdown).
-- The raw token is only ever shown once, right after it's generated; only its hash is
-- stored, so the client never needs to (and can't) read it back.

alter table public.exam_settings add column widget_token_hash text unique;
alter table public.exam_settings add column widget_token_created_at timestamptz;

-- Column-restrict select like letters.body: widget_token_hash is never readable, even by
-- its owner — the UI only needs to know *that* a token exists, via the created_at column.
revoke select on table public.exam_settings from authenticated;
grant select (
  user_id, exam_name, exam_at, target_score, max_score, actual_score, updated_at, widget_token_created_at
) on table public.exam_settings to authenticated;

grant update (widget_token_hash, widget_token_created_at) on table public.exam_settings to authenticated;
