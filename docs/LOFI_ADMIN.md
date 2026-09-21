# Twitch Lofi control plane

The portfolio hosts the Twitch Lofi control plane at the unlinked private path
`/control-plane/lofi` and the external FFmpeg bootstrap script at
`/api/stream.sh`. It is deliberately not part of the public hash router or
navigation.

## Required server configuration

Connect the **Vercel Supabase integration** to this deployment. The Lofi API
reads these integration-created environment variables directly — no extra
Supabase setup is needed:

- `SUPABASE_URL` — the Supabase project URL created by the integration.
- `SUPABASE_SERVICE_ROLE_KEY` — the server-only integration key; never expose
  it to the browser.
- `LOFI_ADMIN_SECRET` — admin phrase used for login and first-time setup.

The integration also provides `POSTGRES_URL` / `POSTGRES_PRISMA_URL` /
`POSTGRES_URL_NON_POOLING` — direct database connection strings. On the first
request, the API connects to the database directly via `POSTGRES_URL` and
applies the Lofi schema automatically if the tables are missing. No manual
migration step, `SUPABASE_ACCESS_TOKEN`, or Management API is required.

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

## Troubleshooting

If you see *"Lofi schema is missing"*:
- Verify the **Vercel Supabase integration** is connected to this project in
  the Vercel dashboard (Settings → Integrations → Supabase).
- The integration must be connected to the deployment, not just listed in
  environment variables. Go to the project, click **Integrations**, and
  connect the Supabase integration there.
- The `POSTGRES_URL` variable must be set. If the integration is connected but
  the tables are still missing, the integration may need to be reconnected.
