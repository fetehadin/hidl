-- Letters sealed on hidl's server (src/lib/letter-crypto.ts): AES-256-GCM with a key that lives
-- only in the server's environment, so the database holds ciphertext. They're stored with
-- encrypted = false (that flag means "end-to-end, decrypt in the browser") and a `srv1.` body.
-- A 30,000-character letter is at most 120,000 bytes of UTF-8, about 160,000 in base64.
alter table public.letters drop constraint letters_body_check;
alter table public.letters add constraint letters_body_check check (
  case when encrypted
    then char_length(body) <= 210000 and (
      body ~ '^e2e1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$'
      or body ~ '^e2e2\.[A-Za-z0-9+/]{87}=\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$'
    )
    else char_length(body) between 1 and 50000
      or (char_length(body) <= 210000 and body ~ '^srv1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$')
  end
);
