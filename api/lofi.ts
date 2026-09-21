import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { bootstrapLofiSchema } from '../api-lib/lofi-schema.js';

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
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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
      throw new Error(`Supabase Lofi schema is missing or the configured project is wrong. Apply twitch-lofi/supabase/migrations to the Supabase project used by SUPABASE_URL (failed request: ${path}).`);
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

  schemaBootstrapPromise ??= bootstrapLofiSchema();
  await schemaBootstrapPromise;

  const adminSecret = process.env.LOFI_ADMIN_SECRET;
  const result = await rows<Settings>('settings?id=eq.1&select=*');
  if (!result[0]) {
    await db('settings', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id: 1, secret_phrase: adminSecret || 'change-me-now' }),
    });
  }
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
    rows<JsonRecord>('tracks?select=id,title,artist,credit,duration_seconds,sort_order,storage_path,created_at&active=eq.true&order=sort_order.asc,created_at.asc&limit=500'),
  ]);
  return { settings: publicSettings(config), secrets_configured: Boolean(config.secret_phrase && config.oxapay_merchant_key), ads, donations, logs, tracks };
}

async function configForHost(req: VercelRequest, token: string) {
  const config = await settings();
  const host = origin(req);
  const ads = await rows<JsonRecord>(`ads?status=eq.approved&start_time=lte.${encodeURIComponent(new Date().toISOString())}&select=id,advertiser_name,banner_url,click_url,duration_seconds,start_time,end_time&order=start_time.asc`);
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
    return json(res, { error: 'Unknown action' }, 404);
  } catch (error) {
    console.error('lofi api error', error);
    return json(res, { error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
}
