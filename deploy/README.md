# Hosting on the Contabo VPS

The app runs as a Docker container on the Contabo server. GitHub Actions builds the image on every merge to `main`
and restarts it over SSH (`.github/workflows/deploy-contabo.yml`). Supabase (database, login, photo storage) stays a managed service.

```
/opt/hidl/
  docker-compose.yml   copy of deploy/docker-compose.yml
  Caddyfile            copy of deploy/Caddyfile (only with the "edge" profile)
  .env                 server settings, from deploy/env.example (never committed)
  downloads/hidl.apk   the Android app, served at /download/android (see mobile/README.md)
```

## One-time server setup

1. Create a `deploy` user that can run Docker, and add the deploy key's public half to its `~/.ssh/authorized_keys`.
2. Copy `docker-compose.yml`, `Caddyfile` and a filled-in `.env` into `/opt/hidl`.
3. Nothing to do for the image: each deploy logs the server in to `ghcr.io` with that run's own GitHub token,
   pulls, and logs out again.
4. Start the app: `docker compose up -d`. Add `--profile edge` only if nothing else on the server already uses
   ports 80/443. If something does (e.g. nginx or another app's Caddy), point that proxy at
   `http://127.0.0.1:3000` (change it with `HIDL_PORT` in `.env`). It must pass the original `Host` header
   through (nginx: `proxy_set_header Host $host;`), or server actions are rejected as cross-origin.

Sign-in redirects and the unlock emails use `NEXT_PUBLIC_SITE_URL` from the build, so it must be the exact public
address (`https://<HIDL_DOMAIN>`), and the same URL must be in Supabase's Auth → URL configuration redirect list.

### On the current server

Ports 80/443 belong to the tajstore Caddy (`/opt/tajstore/Caddyfile`), which also serves redart and voxlace. hidl
has a `hidl.fetehadin.com` block there pointing at `hidl-web:3000`, and `/opt/hidl/docker-compose.override.yml`
(server-only, not in the repo) joins the `web` container to the `tajstore_default` network under that alias.
After editing that Caddyfile: `docker exec tajstore-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.

## GitHub settings (Settings → Secrets and variables → Actions)

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `CONTABO_HOST` | `169.58.96.52`. Setting this turns the workflow on. |
| Variable | `CONTABO_USER` | `deploy` |
| Secret | `CONTABO_SSH_KEY` | private key of the deploy key |
| Variable | `NEXT_PUBLIC_SUPABASE_URL` | the Supabase project URL |
| Variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | its publishable key |
| Variable | `NEXT_PUBLIC_SITE_URL` | `https://<HIDL_DOMAIN>` |
| Variable | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | optional |

`NEXT_PUBLIC_*` values are built into the browser code, so changing one needs a new deploy, not just a restart.

## Day to day

- **Logs:** `docker compose logs -f web`
- **Health:** `curl https://<HIDL_DOMAIN>/api/health`
- **Roll back:** `HIDL_TAG=<older commit sha> docker compose up -d web`
- **After editing `.env`:** `docker compose up -d web cron` (recreates the containers so they read it). Each deploy
  tags the image it started as `latest` on the server, so this keeps the deployed version.
