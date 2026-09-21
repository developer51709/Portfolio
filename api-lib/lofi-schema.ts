import pg from 'pg';

// Individual statements — each runs independently so one failure can't prevent
// the rest from executing. gen_random_uuid() is built-in on PostgreSQL 13+.
const SCHEMA_STATEMENTS = [
  `create table if not exists public.settings (
    id integer primary key default 1,
    secret_phrase text not null default 'change-me-now',
    oxapay_merchant_key text not null default '',
    overlay_text text not null default 'Lofi radio 24/7',
    overlay_settings jsonb not null default '{"show_qr": true, "show_ads": true, "refresh_seconds": 10, "theme": "dark"}'::jsonb,
    stream_settings jsonb not null default '{"rtmp_url": "rtmp://live.twitch.tv/app", "stream_key": "", "resolution": "1920x1080", "fps": 30, "video_bitrate": "4500k", "audio_bitrate": "160k", "preset": "veryfast"}'::jsonb,
    track_metadata jsonb not null default '{"title": "Untitled", "artist": "LofiGenerator", "album": "", "playlist_url": ""}'::jsonb,
    crypto_wallets jsonb not null default '[]'::jsonb,
    donation_settings jsonb not null default '{"description": "Support the stream", "min_amount": 1, "currency": "USDT", "reward_text": "Your name on the overlay!"}'::jsonb,
    ad_settings jsonb not null default '{"rotation_seconds": 20, "max_active": 5, "schedule": []}'::jsonb,
    background_video_url text not null default '',
    lofi_settings jsonb not null default '{"generator_url": "https://LofiGenerator.com", "credit_text": "Generated via LofiGenerator.com", "seed": ""}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint settings_singleton check (id = 1)
  )`,
  `insert into public.settings (id) values (1) on conflict (id) do nothing`,
  `alter table public.settings enable row level security`,
  `create table if not exists public.sessions (
    token text primary key,
    label text not null default 'stream-host',
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    last_seen_at timestamptz
  )`,
  `alter table public.sessions enable row level security`,
  `create table if not exists public.ads (
    id uuid primary key default gen_random_uuid(),
    advertiser_name text not null,
    advertiser_email text not null default '',
    banner_url text not null,
    click_url text not null default '',
    duration_seconds integer not null default 15,
    start_time timestamptz not null default now(),
    end_time timestamptz,
    status text not null default 'pending',
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `alter table public.ads enable row level security`,
  `create index if not exists ads_status_idx on public.ads (status, start_time desc)`,
  `create table if not exists public.donations (
    id uuid primary key default gen_random_uuid(),
    amount numeric(18,6) not null,
    currency text not null default 'USDT',
    donor_name text not null default 'Anonymous',
    message text not null default '',
    status text not null default 'pending',
    track_id text not null default '',
    pay_link text not null default '',
    provider_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `alter table public.donations enable row level security`,
  `create table if not exists public.logs (
    id uuid primary key default gen_random_uuid(),
    level text not null default 'info',
    source text not null default 'stream-host',
    message text not null,
    meta jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`,
  `alter table public.logs enable row level security`,
  `create index if not exists logs_created_at_idx on public.logs (created_at desc)`,
  `create table if not exists public.tracks (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    artist text not null default 'Unknown',
    storage_path text not null,
    duration_seconds integer not null default 0,
    bytes integer not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    credit text not null default '',
    sort_order integer not null default 0
  )`,
  `alter table public.tracks add column if not exists credit text not null default ''`,
  `alter table public.tracks add column if not exists sort_order integer not null default 0`,
  `alter table public.tracks enable row level security`,
  `create index if not exists tracks_sort_order_idx on public.tracks (sort_order, created_at)`,
  `create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql set search_path = public`,
  `do $$ begin
    if not exists (select 1 from pg_trigger where tgname = 'settings_touch') then
      create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'ads_touch') then
      create trigger ads_touch before update on public.ads for each row execute function public.touch_updated_at();
    end if;
    if not exists (select 1 from pg_trigger where tgname = 'donations_touch') then
      create trigger donations_touch before update on public.donations for each row execute function public.touch_updated_at();
    end if;
  end $$`,
  // Tell PostgREST (Supabase REST API) to reload its schema cache so newly
  // created tables become visible through the /rest/v1/ endpoint immediately.
  `NOTIFY pgrst, 'reload schema'`,
];

/**
 * Connect directly to the database using the Postgres connection string
 * provided by the Vercel Supabase integration.
 */
function postgresUrl(): string {
  const url =
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    '';
  if (!url) {
    throw new Error(
      'No Postgres connection string found. The Vercel Supabase integration provides POSTGRES_URL — make sure the integration is connected to this deployment.',
    );
  }
  return url;
}

function buildConnectionString(): string {
  const raw = postgresUrl();
  // Append sslmode=no-verify so pg uses SSL but skips certificate verification.
  // Supabase uses self-signed certs; this is the most reliable cross-version approach.
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}sslmode=no-verify`;
}

export async function bootstrapLofiSchema() {
  const connectionString = buildConnectionString();

  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 30_000,
  });

  try {
    await client.connect();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Automatic Lofi schema setup failed (connection): ${msg}. Verify POSTGRES_URL is set and points to the correct Supabase project.`,
    );
  }

  const errors: string[] = [];
  for (const sql of SCHEMA_STATEMENTS) {
    try {
      await client.query(sql);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/already exists/i.test(msg)) continue;
      errors.push(msg);
    }
  }

  // Verify the settings table is accessible
  try {
    await client.query('select 1 from public.settings limit 1');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`settings table verification failed: ${msg}`);
  }

  await client.end().catch(() => {});

  if (errors.length > 0) {
    throw new Error(
      `Automatic Lofi schema setup partially failed: ${errors.join('; ')}. Apply twitch-lofi/supabase/migrations manually via the Supabase SQL editor if needed.`,
    );
  }
}

/**
 * Execute a SQL query directly via the Postgres connection and return the rows.
 * Bypasses the Supabase REST API which may have a stale schema cache.
 */
export async function pgQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const connectionString = buildConnectionString();
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
  });
  try {
    await client.connect();
    const result = await client.query(sql);
    return (result.rows ?? []) as T[];
  } finally {
    await client.end().catch(() => {});
  }
}
