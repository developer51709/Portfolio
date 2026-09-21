import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { put } from '@vercel/blob';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-lofi-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const SESSION_HOURS = 12;
const MAX_BODY = 32_000;
const attempts = new Map<string, { count: number; reset: number }>();

type JsonRecord = Record<string, unknown>;
type Settings = JsonRecord & {
  secret_phrase?: string;
  oxapay_merchant_key?: string;
  updated_at?: string;
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing the Vercel Supabase integration variables: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  return { url: url.replace(/\/$/, ''), key };
}

async function db(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Supabase Lofi schema is missing or the configured project is wrong. Apply twitch-lofi/supabase/migrations to the project from the Vercel Supabase integration URL (failed request: ${path}).`);
    }
    throw new Error(`Database request failed (${response.status}) for ${path}`);
  }
  return response;
}

async function rows<T>(path: string, init?: RequestInit): Promise<T[]> {
  const response = await db(path, init);
  return (await response.json()) as T[];
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requestIp(req: VercelRequest) {
  return String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0];
}

function allowedAttempt(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 15 * 60_000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

async function body(req: VercelRequest): Promise<JsonRecord> {
  if (typeof req.body === 'object' && req.body) return req.body as JsonRecord;
  const raw = typeof req.body === 'string' ? req.body : '';
  if (raw.length > MAX_BODY) throw new Error('Request body too large');
  try {
    return (raw ? JSON.parse(raw) : {}) as JsonRecord;
  } catch {
    throw new Error('Invalid JSON');
  }
}

function json(res: VercelResponse, value: unknown, status = 200) {
  Object.entries(CORS).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(value);
}

let schemaBootstrapPromise: Promise<void> | null = null;

async function settings() {
  try {
    const result = await rows<Settings>('settings?id=eq.1&select=*');
    if (result[0]) return result[0];
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Supabase Lofi schema is missing')) throw error;
  }

  // Schema missing via REST — lazy-load pg to bootstrap, then retry REST
  schemaBootstrapPromise ??= (async () => {
    const { bootstrapLofiSchema } = await import('../api-lib/lofi-schema.js');
    await bootstrapLofiSchema();
  })();
  await schemaBootstrapPromise;

  // Give PostgREST time to reload schema cache after NOTIFY
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Retry REST API now that tables exist and PostgREST has reloaded
  const retry = await rows<Settings>('settings?id=eq.1&select=*');
  if (retry[0]) return retry[0];

  // Insert default settings row via REST
  const adminSecret = process.env.LOFI_ADMIN_SECRET;
  await db('settings', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id: 1, secret_phrase: adminSecret || 'change-me-now' }),
  });

  const bootstrapped = await rows<Settings>('settings?id=eq.1&select=*');
  if (!bootstrapped[0]) throw new Error('Lofi settings could not be initialized after schema setup.');
  return bootstrapped[0];
}

function publicSettings(value: Settings): Settings {
  const copy = { ...value };
  delete copy.secret_phrase;
  delete copy.oxapay_merchant_key;
  const stream = { ...((copy.stream_settings as JsonRecord | undefined) ?? {}) };
  const hasStreamKey = typeof stream.stream_key === 'string' && stream.stream_key.length > 0;
  delete stream.stream_key;
  copy.stream_settings = stream;
  copy.stream_key_configured = hasStreamKey;
  return copy;
}

async function verify(rawToken: string | undefined) {
  if (!rawToken || rawToken.length < 32 || rawToken.length > 160) return false;
  const found = await rows<{ token: string; expires_at: string }>(
    `sessions?token=eq.${encodeURIComponent(hash(rawToken))}&select=token,expires_at`,
  );
  const session = found[0];
  if (!session || Date.parse(session.expires_at) <= Date.now()) return false;
  await db(`sessions?token=eq.${encodeURIComponent(session.token)}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  });
  return true;
}

async function session(label: string) {
  const token = randomBytes(48).toString('base64url');
  const expires = new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString();
  await db('sessions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ token: hash(token), label, expires_at: expires }),
  });
  return { token, expires_at: expires };
}

function tokenFrom(req: VercelRequest) {
  const header = req.headers['x-lofi-token'];
  const query = req.query.token;
  return String(header ?? query ?? '') || undefined;
}

function origin(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-proto'];
  const host = req.headers.host ?? 'localhost';
  return `${forwarded ?? 'https'}://${host}`;
}

function cleanPatch(input: JsonRecord) {
  const allowed = [
    'overlay_text',
    'overlay_settings',
    'stream_settings',
    'track_metadata',
    'crypto_wallets',
    'donation_settings',
    'ad_settings',
    'background_video_url',
    'lofi_settings',
  ];
  const patch: JsonRecord = {};
  for (const key of allowed) if (key in input) patch[key] = input[key];
  if ('overlay_text' in patch && typeof patch.overlay_text !== 'string') throw new Error('Invalid overlay text');
  if ('background_video_url' in patch && typeof patch.background_video_url !== 'string') throw new Error('Invalid background URL');
  return patch;
}

async function adminData() {
  const [config, ads, donations, logs, tracks] = await Promise.all([
    settings(),
    rows<JsonRecord>('ads?select=*&order=created_at.desc&limit=200'),
    rows<JsonRecord>('donations?select=id,amount,currency,donor_name,message,status,created_at&order=created_at.desc&limit=50'),
    rows<JsonRecord>('logs?select=id,level,source,message,created_at&order=created_at.desc&limit=80'),
    rows<JsonRecord>('tracks?select=id,title,artist,credit,duration_seconds,sort_order,storage_path,active,created_at&order=sort_order.asc,created_at.asc&limit=500'),
  ]);
  return { settings: publicSettings(config), secrets_configured: Boolean(config.secret_phrase && config.oxapay_merchant_key), ads, donations, logs, tracks };
}

async function configForHost(req: VercelRequest, token: string) {
  const config = await settings();
  const host = origin(req);
  const now = new Date().toISOString();
  const ads = await rows<JsonRecord>(`ads?status=eq.approved&start_time=lte.${encodeURIComponent(now)}&select=id,advertiser_name,banner_url,click_url,duration_seconds,start_time,end_time&order=start_time.asc`);
  const tracks = await rows<JsonRecord>('tracks?active=eq.true&select=id,title,artist,credit,duration_seconds,sort_order&order=sort_order.asc,created_at.asc&limit=500');
  const track = { ...((config.track_metadata as JsonRecord | undefined) ?? {}) };
  if (tracks.length) {
    track.library = tracks;
    track.library_size = tracks.length;
  }
  return {
    updated_at: config.updated_at,
    server_time: new Date().toISOString(),
    poll_interval_seconds: 15,
    stream: config.stream_settings ?? {},
    track,
    overlay: { ...((config.overlay_settings as JsonRecord | undefined) ?? {}), text: config.overlay_text ?? '', url: null, credit: (config.lofi_settings as JsonRecord | undefined)?.credit_text ?? '' },
    background_video_url: config.background_video_url ?? '',
    lofi: config.lofi_settings ?? {},
    crypto_wallets: config.crypto_wallets ?? [],
    donations: config.donation_settings ?? {},
    ads_settings: config.ad_settings ?? {},
    ads,
    endpoints: { config: `${host}/api/lofi?action=config`, log: `${host}/api/lofi?action=log` },
    obs_browser_source: false,
    auth_token: token,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return json(res, null, 204);
  try {
    const action = String(req.query.action ?? '');
    if (action === 'login') {
      if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);
      if (!allowedAttempt(requestIp(req))) return json(res, { error: 'Too many attempts' }, 429);
      const input = await body(req);
      const phrase = typeof input.phrase === 'string' ? input.phrase : '';
      if (phrase.length < 1 || phrase.length > 500) return json(res, { error: 'Invalid phrase' }, 401);
      const config = await settings();
      const configured = process.env.LOFI_ADMIN_SECRET || config.secret_phrase || '';
      if (!safeEqual(phrase, configured)) return json(res, { error: 'Invalid credentials' }, 401);
      return json(res, { ...(await session('admin')), ok: true });
    }

    const token = tokenFrom(req);
    if (!(await verify(token))) return json(res, { error: 'Unauthorized' }, 401);

    if (action === 'admin') return json(res, await adminData());
    if (action === 'config') return json(res, await configForHost(req, token!));
    if (action === 'save' && req.method === 'POST') {
      const input = await body(req);
      const patch = cleanPatch(input.patch && typeof input.patch === 'object' ? input.patch as JsonRecord : {});
      const current = await settings();
      if (patch.stream_settings && typeof patch.stream_settings === 'object') {
        patch.stream_settings = {
          ...((current.stream_settings as JsonRecord | undefined) ?? {}),
          ...(patch.stream_settings as JsonRecord),
        };
      }
      if (typeof input.stream_key === 'string' && input.stream_key.length <= 500) {
        patch.stream_settings = {
          ...((patch.stream_settings as JsonRecord | undefined) ?? {}),
          stream_key: input.stream_key,
        };
      }
      if (typeof input.secret_phrase === 'string' && input.secret_phrase.length >= 12) patch.secret_phrase = input.secret_phrase;
      if (typeof input.oxapay_merchant_key === 'string') patch.oxapay_merchant_key = input.oxapay_merchant_key.slice(0, 300);
      if (!Object.keys(patch).length) return json(res, { error: 'No valid settings supplied' }, 400);
      await db('settings?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      return json(res, { ok: true, ...(await adminData()) });
    }
    if (action === 'ad' && req.method === 'POST') {
      const input = await body(req);
      const id = typeof input.id === 'string' ? input.id : '';
      const command = input.command;
      if (!/^[0-9a-f-]{36}$/i.test(id) || !['approve', 'reject', 'delete'].includes(String(command))) return json(res, { error: 'Invalid ad action' }, 400);
      if (command === 'delete') await db(`ads?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      else await db(`ads?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: command === 'approve' ? 'approved' : 'rejected' }) });
      return json(res, { ok: true });
    }
    if (action === 'log' && req.method === 'POST') {
      const input = await body(req);
      const message = typeof input.message === 'string' ? input.message.slice(0, 2000) : '';
      if (!message) return json(res, { error: 'Message required' }, 400);
      await db('logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ level: String(input.level ?? 'info').slice(0, 20), source: 'stream-host', message }) });
      return json(res, { ok: true });
    }
    if (action === 'track_upload' && req.method === 'POST') {
      // Multipart upload: the frontend sends the file as a multipart form
      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.includes('multipart')) return json(res, { error: 'Expected multipart form data' }, 400);
      const formData = await new Response(req as unknown as BodyInit).formData();
      const file = formData.get('file') as File | null;
      if (!file) return json(res, { error: 'No file provided' }, 400);
      const title = String(formData.get('title') ?? file.name ?? '').trim().slice(0, 300);
      const artist = String(formData.get('artist') ?? 'Unknown').trim().slice(0, 200);
      const credit = String(formData.get('credit') ?? '').trim().slice(0, 300);
      if (!title) return json(res, { error: 'Title is required' }, 400);
      // Upload to Vercel Blob
      const blob = await put(`lofi/tracks/${Date.now()}-${file.name}`, file, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN });
      // Auto sort_order: get current max
      const existing = await rows<JsonRecord>('tracks?select=sort_order&order=sort_order.desc&limit=1');
      const nextSort = ((existing[0] as JsonRecord | undefined)?.sort_order as number ?? -1) + 1;
      const response = await db('tracks', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ title, artist, storage_path: blob.url, credit, duration_seconds: 0, bytes: file.size, sort_order: nextSort, active: true }),
      });
      const rows2 = await response.json() as JsonRecord[];
      return json(res, { ok: true, track: rows2[0] ?? null });
    }
    if (action === 'track_add' && req.method === 'POST') {
      const input = await body(req);
      const title = typeof input.title === 'string' ? input.title.trim().slice(0, 300) : '';
      const artist = typeof input.artist === 'string' ? input.artist.trim().slice(0, 200) : 'Unknown';
      const storage_path = typeof input.storage_path === 'string' ? input.storage_path.trim().slice(0, 500) : '';
      const credit = typeof input.credit === 'string' ? input.credit.trim().slice(0, 300) : '';
      const duration_seconds = typeof input.duration_seconds === 'number' ? Math.max(0, Math.floor(input.duration_seconds)) : 0;
      if (!title) return json(res, { error: 'Title is required' }, 400);
      if (!storage_path) return json(res, { error: 'Storage path is required' }, 400);
      // Auto sort_order
      const existing = await rows<JsonRecord>('tracks?select=sort_order&order=sort_order.desc&limit=1');
      const nextSort = ((existing[0] as JsonRecord | undefined)?.sort_order as number ?? -1) + 1;
      const response = await db('tracks', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ title, artist, storage_path, credit, duration_seconds, sort_order: nextSort, active: true }),
      });
      const inserted = await response.json() as JsonRecord[];
      return json(res, { ok: true, track: inserted[0] ?? null });
    }
    if (action === 'track_update' && req.method === 'POST') {
      const input = await body(req);
      const id = typeof input.id === 'string' ? input.id : '';
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, { error: 'Invalid track ID' }, 400);
      const patch: JsonRecord = {};
      if (typeof input.title === 'string') patch.title = input.title.trim().slice(0, 300);
      if (typeof input.artist === 'string') patch.artist = input.artist.trim().slice(0, 200);
      if (typeof input.storage_path === 'string') patch.storage_path = input.storage_path.trim().slice(0, 500);
      if (typeof input.credit === 'string') patch.credit = input.credit.trim().slice(0, 300);
      if (typeof input.duration_seconds === 'number') patch.duration_seconds = Math.max(0, Math.floor(input.duration_seconds));
      if (typeof input.sort_order === 'number') patch.sort_order = Math.floor(input.sort_order);
      if (typeof input.active === 'boolean') patch.active = input.active;
      if (!Object.keys(patch).length) return json(res, { error: 'No fields to update' }, 400);
      await db(`tracks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      return json(res, { ok: true });
    }
    if (action === 'track_delete' && req.method === 'POST') {
      const input = await body(req);
      const id = typeof input.id === 'string' ? input.id : '';
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, { error: 'Invalid track ID' }, 400);
      await db(`tracks?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      return json(res, { ok: true });
    }
    return json(res, { error: 'Unknown action' }, 404);
  } catch (error) {
    console.error('lofi api error', error);
    return json(res, { error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
}
