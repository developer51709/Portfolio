const LOFI_SCHEMA_SQL = `
create extension if not exists pgcrypto;

create table if not exists public.settings (
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
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

grant all on public.settings to service_role;
alter table public.settings enable row level security;

create table if not exists public.sessions (
  token text primary key,
  label text not null default 'stream-host',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz
);

grant all on public.sessions to service_role;
alter table public.sessions enable row level security;

create table if not exists public.ads (
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
);

grant all on public.ads to service_role;
alter table public.ads enable row level security;
create index if not exists ads_status_idx on public.ads (status, start_time desc);

create table if not exists public.donations (
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
);

grant all on public.donations to service_role;
alter table public.donations enable row level security;

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info',
  source text not null default 'stream-host',
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

grant all on public.logs to service_role;
alter table public.logs enable row level security;
create index if not exists logs_created_at_idx on public.logs (created_at desc);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null default 'LofiControl Generator',
  storage_path text not null,
  duration_seconds integer not null default 0,
  bytes integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  credit text not null default '',
  sort_order integer not null default 0
);

alter table public.tracks add column if not exists credit text not null default '';
alter table public.tracks add column if not exists sort_order integer not null default 0;
grant all on public.tracks to service_role;
alter table public.tracks enable row level security;
create index if not exists tracks_sort_order_idx on public.tracks (sort_order, created_at);

create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql set search_path = public;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'settings_touch') then
    create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'ads_touch') then
    create trigger ads_touch before update on public.ads for each row execute function public.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'donations_touch') then
    create trigger donations_touch before update on public.donations for each row execute function public.touch_updated_at();
  end if;
end $$;
`;

function projectRef() {
  const configured = process.env.SUPABASE_PROJECT_REF;
  if (configured) return configured;
  const url = process.env.SUPABASE_URL ?? '';
  return url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? '';
}

export async function bootstrapLofiSchema() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_MANAGEMENT_TOKEN;
  const ref = projectRef();
  if (!accessToken || !ref) {
    throw new Error('Lofi schema is missing. Automatic setup requires SUPABASE_ACCESS_TOKEN and a Supabase project URL/ref; the service-role key cannot create database tables.');
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: LOFI_SCHEMA_SQL }),
  });
  if (!response.ok) {
    throw new Error(`Automatic Lofi schema setup failed (${response.status}). Check SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.`);
  }
}
