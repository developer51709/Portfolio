# Twitch Lofi control plane

The portfolio now hosts the Twitch Lofi control plane at `#/admin` and the
external FFmpeg bootstrap script at `/api/stream.sh`.

## Required server configuration

The Vercel deployment needs these environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; never expose this to the browser
- `LOFI_ADMIN_SECRET` — recommended admin phrase; if omitted, the existing
  `settings.secret_phrase` database value is used for compatibility

The Supabase schema is the one in `twitch-lofi/supabase/migrations/`. Apply it
to the Supabase project used by the deployment before opening the admin page.

## Usage

1. Open `https://sorenthedev.indevs.in/#/admin`.
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
