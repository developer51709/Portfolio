# Twitch Lofi control plane

The portfolio hosts the Twitch Lofi control plane at the unlinked private path
`/control-plane/lofi` and the external FFmpeg bootstrap script at
`/api/stream.sh`. It is deliberately not part of the public hash router or
navigation.

## Required server configuration

The Vercel deployment needs these environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never expose this to the browser
- `LOFI_ADMIN_SECRET` — admin phrase used for login and first-time setup
- `SUPABASE_ACCESS_TOKEN` — Supabase Management API token used only to apply the
  Lofi schema automatically when the REST tables are missing
- `SUPABASE_PROJECT_REF` — optional when it can be derived from `SUPABASE_URL`

On the first request, the API checks for the Lofi settings table. If it is
missing, it applies an idempotent equivalent of the migrations in
`twitch-lofi/supabase/migrations/` through the Supabase Management API, then
retries the request. This requires `SUPABASE_ACCESS_TOKEN`; the Supabase
service-role key can access tables but cannot create database schema objects.

## Usage

1. Open the private path `https://sorenthedev.indevs.in/control-plane/lofi`.
   It is not linked from the public portfolio. The API authentication remains
   the actual security boundary; the hidden path is only a routing/privacy
   measure.
2. Sign in with the admin phrase.
3. Configure the Twitch RTMP destination, stream key, background video, and
   playback settings.
4. Copy the generated command from **Host bootstrap** and run it on the host
   machine:

   ```bash
   bash <(curl -fsSL https://sorenthedev.indevs.in/api/stream.sh)
   ```

The host authenticates to `/api/lofi?action=login`, receives a short-lived
session, and polls `/api/lofi?action=config` for changes. Configuration is
kept in temporary runtime files only.

## Security notes

- Login attempts are rate-limited per source address.
- Session tokens are random, expire after 12 hours, and only their SHA-256
  hashes are stored in Supabase.
- Admin responses redact the login phrase, OxaPay merchant key, and stream key.
- Stream keys are only sent back to an authenticated host session and can be
  replaced from the protected admin form.
- The Supabase service-role key is used only by the Vercel function and is never
  bundled into the client.
- The API uses a request header for authenticated host polling rather than
  putting the session token in a browser-source URL.

## OBS removal

The merged implementation does not expose or use `/overlay.html`, an OBS
browser source, or browser-source tokens. Stream text and visuals are generated
by FFmpeg on the host process instead.
