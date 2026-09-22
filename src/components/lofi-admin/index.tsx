import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiCheck as Check,
  FiCopy as Copy,
  FiEdit3 as Edit3,
  FiKey as KeyRound,
  FiLogOut as LogOut,
  FiMusic as Music,
  FiPlus as Plus,
  FiRadio as Radio,
  FiRefreshCw as RefreshCw,
  FiSave as Save,
  FiShield as ShieldCheck,
  FiTrash2 as Trash2,
  FiX as X,
} from 'react-icons/fi';

type RecordValue = Record<string, unknown>;
type AdminData = {
  settings: RecordValue;
  secrets_configured: boolean;
  ads: RecordValue[];
  donations: RecordValue[];
  logs: RecordValue[];
  tracks: RecordValue[];
};

const TOKEN_KEY = 'lofi.admin.session';
const api = '/api/lofi';

async function request<T>(action: string, init: RequestInit = {}, token = ''): Promise<T> {
  const response = await fetch(`${api}?action=${action}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-lofi-token': token } : {}), ...(init.headers ?? {}) },
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

const field = 'input input-bordered w-full bg-base-300/70';
const panel = 'card border border-base-content/10 bg-base-100/50 shadow-xl backdrop-blur-xl';

type Track = {
  id: string;
  title: string;
  artist: string;
  storage_path: string;
  duration_seconds: number;
  sort_order: number;
  active: boolean;
  credit: string;
};

export default function LofiAdmin({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? '');
  const [phrase, setPhrase] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [data, setData] = useState<AdminData | null>(null);
  const [draft, setDraft] = useState<RecordValue>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [trackDraft, setTrackDraft] = useState<Partial<Track>>({});
  const [editingTrack, setEditingTrack] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Track>>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (activeToken: string) => {
    const result = await request<AdminData>('admin', {}, activeToken);
    setData(result);
    setDraft(result.settings);
  }, []);

  useEffect(() => {
    if (!token) return;
    void load(token).catch(() => {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken('');
      setData(null);
    });
  }, [load, token]);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const hostCommand = useMemo(() => `bash <(curl -fsSL ${origin}/api/stream.sh)`, [origin]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await request<{ token: string }>('login', { method: 'POST', body: JSON.stringify({ phrase }) });
      sessionStorage.setItem(TOKEN_KEY, result.token);
      setPhrase('');
      setToken(result.token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const result = await request<AdminData>('save', { method: 'POST', body: JSON.stringify({ patch: draft, ...(streamKey ? { stream_key: streamKey } : {}) }) }, token);
      setData(result);
      setDraft(result.settings);
      setMessage('Settings saved. The host picks them up on its next poll.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken('');
    setData(null);
  }

  function nested(key: string, name: string) {
    return String(((draft[key] as RecordValue | undefined) ?? {})[name] ?? '');
  }
  function setNested(key: string, name: string, value: string | number | boolean) {
    setDraft((current) => ({ ...current, [key]: { ...((current[key] as RecordValue) ?? {}), [name]: value } }));
  }
  function copy(value: string) {
    void navigator.clipboard.writeText(value);
    setMessage('Copied to clipboard.');
  }

  if (!token || !data) {
    return (
      <main className="relative min-h-screen bg-base-300 px-4 py-16">
        <div className="mx-auto max-w-md">
          <div className={`${panel} card-body`}>
            <span className="badge badge-primary gap-2"><KeyRound /> private control plane</span>
            <h1 className="card-title mt-5 text-3xl">Lofi stream admin</h1>
            <p className="mt-2 text-sm text-base-content/60">The phrase is never placed in a URL or persisted. Only a short-lived session token is kept for this tab.</p>
            <form onSubmit={login} className="mt-6 space-y-4">
              <input className={field} type="password" value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="Admin phrase" autoComplete="current-password" required />
              <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Checking…' : 'Unlock dashboard'}</button>
            </form>
            {message && <p className="mt-4 text-sm text-error">{message}</p>}
            <button className="btn btn-ghost mt-4" onClick={onBack}>Back to portfolio</button>
          </div>
        </div>
      </main>
    );
  }

  const settings = draft;
  const stream = (settings.stream_settings as RecordValue) ?? {};
  const overlay = (settings.overlay_settings as RecordValue) ?? {};

  return (
    <main className="relative min-h-screen bg-base-300 px-4 py-10 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><span className="badge badge-primary gap-2"><Radio /> control plane</span><h1 className="mt-3 text-3xl font-bold">Lofi stream admin</h1><p className="text-sm text-base-content/60">Manage the external FFmpeg host. No OBS browser source is used.</p></div>
          <div className="flex gap-2"><button className="btn btn-ghost" onClick={() => void load(token)}><RefreshCw /> Refresh</button><button className="btn btn-ghost" onClick={logout}><LogOut /> Sign out</button></div>
        </header>

        <section className={`${panel} card-body mt-8`}>
          <div className="flex items-center gap-2 text-primary"><ShieldCheck /><h2 className="text-lg font-semibold">Host bootstrap</h2></div>
          <p className="mt-2 text-sm text-base-content/60">Run this on the machine that owns the Twitch stream. It authenticates once, keeps only temporary runtime files, and polls the control plane for changes.</p>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-base-300 p-3 font-mono text-xs"><code className="flex-1 break-all">{hostCommand}</code><button className="btn btn-ghost btn-sm" onClick={() => copy(hostCommand)}><Copy /></button></div>
          <p className="mt-3 text-xs text-success">OBS/browser-source integration removed. Overlays are generated by FFmpeg on the host.</p>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className={`${panel} card-body`}><h2 className="text-lg font-semibold">Stream</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">
            {([['rtmp_url', 'RTMP URL'], ['stream_key', 'Stream key'], ['resolution', 'Resolution'], ['fps', 'FPS'], ['video_bitrate', 'Video bitrate'], ['audio_bitrate', 'Audio bitrate'], ['preset', 'Preset']] as const).map(([key, label]) => <label key={key} className="text-xs text-base-content/60">{label}<input className={`${field} mt-1`} type={key === 'fps' ? 'number' : key === 'stream_key' ? 'password' : 'text'} value={key === 'stream_key' ? streamKey : String(stream[key] ?? '')} placeholder={key === 'stream_key' && data.settings.stream_key_configured ? '•••••••••••• (leave empty to keep)' : undefined} onChange={(e) => key === 'stream_key' ? setStreamKey(e.target.value) : setNested('stream_settings', key, key === 'fps' ? Number(e.target.value) || 0 : e.target.value)} /></label>)}
          </div></section>

          <section className={`${panel} card-body`}><h2 className="text-lg font-semibold">Overlay & playback</h2><label className="mt-4 text-xs text-base-content/60">Overlay title<textarea className={`${field} mt-1`} rows={2} value={String(settings.overlay_text ?? '')} onChange={(e) => setDraft((p) => ({ ...p, overlay_text: e.target.value }))} /></label><label className="mt-3 text-xs text-base-content/60">Overlay subtitle<input className={`${field} mt-1`} value={nested('overlay_settings', 'subtitle')} onChange={(e) => setNested('overlay_settings', 'subtitle', e.target.value)} placeholder="Text shown below the title" /></label><label className="mt-3 text-xs text-base-content/60">Background video URL<input className={`${field} mt-1`} value={String(settings.background_video_url ?? '')} onChange={(e) => setDraft((p) => ({ ...p, background_video_url: e.target.value }))} /></label><div className="mt-4 flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={overlay.show_qr !== false} onChange={(e) => setNested('overlay_settings', 'show_qr', e.target.checked)} /> Show QR codes</label><label><input type="checkbox" checked={overlay.show_ads !== false} onChange={(e) => setNested('overlay_settings', 'show_ads', e.target.checked)} /> Show ads</label></div></section>

          <section className={`${panel} card-body`}><h2 className="text-lg font-semibold">Sponsor overlay</h2><p className="mt-2 text-sm text-base-content/60">Show a sponsor card in the stream’s top corner with a QR code linking to the sponsor page.</p><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={overlay.sponsor_enabled === true} onChange={(e) => setNested('overlay_settings', 'sponsor_enabled', e.target.checked)} /> Enable sponsor overlay</label><label className="mt-4 text-xs text-base-content/60">Sponsor name<input className={`${field} mt-1`} value={nested('overlay_settings', 'sponsor_title')} onChange={(e) => setNested('overlay_settings', 'sponsor_title', e.target.value)} placeholder="Sponsor name" /></label><label className="mt-3 text-xs text-base-content/60">Sponsor page URL<input className={`${field} mt-1`} type="url" value={nested('overlay_settings', 'sponsor_url')} onChange={(e) => setNested('overlay_settings', 'sponsor_url', e.target.value)} placeholder="https://example.com/sponsor" /></label></section>

          <section className={`${panel} card-body`}><h2 className="text-lg font-semibold">Security</h2><p className="mt-3 text-sm text-base-content/60">Sessions are short-lived, rate-limited at login, hashed in the database, and sent in a request header rather than a URL. Sensitive values are redacted from admin responses.</p><label className="mt-4 text-xs text-base-content/60">Replace admin phrase (12+ characters)<input className={`${field} mt-1`} type="password" placeholder="Leave empty to keep current" onChange={(e) => setDraft((p) => ({ ...p, secret_phrase: e.target.value }))} /></label></section>
        </div>

        <button className="btn btn-primary mt-6" disabled={busy} onClick={() => void save()}><Save /> {busy ? 'Saving…' : 'Save all changes'}</button>{message && <p className="mt-3 text-sm text-primary">{message}</p>}          <section className={`${panel} card-body mt-6`}><div className="flex items-center gap-2 text-primary"><Music /><h2 className="text-lg font-semibold">Playback list</h2></div><p className="mt-2 text-sm text-base-content/60">Add audio files with their title and artist. The host picks them up on its next poll.</p>

            <div className="mt-4 rounded-lg border border-base-content/10 bg-base-300/50 p-4">
              <h3 className="text-sm font-medium mb-3">Add new track</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-base-content/60">Title<input className={`${field} mt-1`} value={trackDraft.title ?? ''} onChange={(e) => setTrackDraft((p) => ({ ...p, title: e.target.value }))} placeholder="Song title" /></label>
                <label className="text-xs text-base-content/60">Artist<input className={`${field} mt-1`} value={trackDraft.artist ?? ''} onChange={(e) => setTrackDraft((p) => ({ ...p, artist: e.target.value }))} placeholder="Artist name" /></label>
                <label className="text-xs text-base-content/60">Credit (optional)<input className={`${field} mt-1`} value={trackDraft.credit ?? ''} onChange={(e) => setTrackDraft((p) => ({ ...p, credit: e.target.value }))} placeholder="Source credit" /></label>
              </div>

              <div className="mt-3 flex flex-col gap-3">
                <label className="text-xs text-base-content/60">Upload audio file
                  <input className="file-input file-input-bordered file-input-sm w-full bg-base-300/70 mt-1" type="file" accept="audio/*" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                </label>
                {uploadFile && <p className="text-xs text-base-content/50">Selected: {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(1)} MB)</p>}
                <button className="btn btn-primary btn-sm" disabled={uploading || !uploadFile || !trackDraft.title} onClick={() => void (async () => {
                  setUploading(true); setMessage('');
                  try {
                    // Read file as base64
                    const arrayBuf = await uploadFile!.arrayBuffer();
                    const b64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
                    const resp = await fetch(`${api}?action=track_upload`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-lofi-token': token },
                      body: JSON.stringify({
                        file: b64,
                        filename: uploadFile!.name,
                        mimeType: uploadFile!.type || 'audio/mpeg',
                        title: trackDraft.title ?? '',
                        artist: trackDraft.artist ?? 'Unknown',
                        credit: trackDraft.credit ?? '',
                      }),
                    });
                    const payload = await resp.json() as { error?: string };
                    if (!resp.ok) throw new Error(payload.error || 'Upload failed');
                    setTrackDraft({}); setUploadFile(null);
                    await load(token);
                    setMessage('Track uploaded and added.');
                  } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed'); } finally { setUploading(false); }
                })()}>{uploading ? 'Uploading…' : 'Upload & add'}</button>
              </div>

              <div className="divider text-xs text-base-content/40">or add by URL</div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-base-content/60">Storage path (URL)<input className={`${field} mt-1`} value={trackDraft.storage_path ?? ''} onChange={(e) => setTrackDraft((p) => ({ ...p, storage_path: e.target.value }))} placeholder="https://... or storage path" /></label>
              </div>
              <button className="btn btn-ghost btn-sm mt-3" disabled={busy || !trackDraft.title || !trackDraft.storage_path} onClick={() => void (async () => {
                setBusy(true);
                try {
                  await request('track_add', { method: 'POST', body: JSON.stringify(trackDraft) }, token);
                  setTrackDraft({});
                  await load(token);
                  setMessage('Track added.');
                } catch (error) { setMessage(error instanceof Error ? error.message : 'Add failed'); } finally { setBusy(false); }
              })()}><Plus /> Add by URL</button>
            </div>

            <div className="mt-4 grid gap-2">
              {data.tracks.length === 0 ? <p className="text-sm text-base-content/50">No tracks.</p> : (data.tracks as unknown as Track[]).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((track) => (
                <div key={track.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-base-content/10 p-3">
                  {editingTrack === track.id ? (
                    <div className="w-full grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-base-content/60">Title<input className={`${field} mt-1`} value={editDraft.title ?? track.title} onChange={(e) => setEditDraft((p) => ({ ...p, title: e.target.value }))} /></label>
                      <label className="text-xs text-base-content/60">Artist<input className={`${field} mt-1`} value={editDraft.artist ?? track.artist} onChange={(e) => setEditDraft((p) => ({ ...p, artist: e.target.value }))} /></label>
                      <label className="text-xs text-base-content/60">Credit<input className={`${field} mt-1`} value={editDraft.credit ?? track.credit} onChange={(e) => setEditDraft((p) => ({ ...p, credit: e.target.value }))} /></label>
                      <label className="text-xs text-base-content/60">Sort order<input className={`${field} mt-1`} type="number" value={String(editDraft.sort_order ?? track.sort_order)} onChange={(e) => setEditDraft((p) => ({ ...p, sort_order: Number(e.target.value) || 0 }))} /></label>
                      <div className="flex gap-2 sm:col-span-2">
                        <button className="btn btn-primary btn-sm" onClick={() => void (async () => {
                          setBusy(true);
                          try {
                            await request('track_update', { method: 'POST', body: JSON.stringify({ id: track.id, ...editDraft }) }, token);
                            setEditingTrack(null); setEditDraft({});
                            await load(token);
                            setMessage('Track updated.');
                          } catch (error) { setMessage(error instanceof Error ? error.message : 'Update failed'); } finally { setBusy(false); }
                        })()}><Check /> Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditingTrack(null); setEditDraft({}); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <strong className="truncate block">{track.title}</strong>
                        <p className="text-xs text-base-content/50 truncate">{track.artist} · {track.credit || 'No credit'} · #{track.sort_order}</p>
                      </div>
                      <span className={`badge badge-sm ${track.active ? 'badge-success' : 'badge-ghost'}`}>{track.active ? 'Active' : 'Inactive'}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditingTrack(track.id); setEditDraft({ title: track.title, artist: track.artist, credit: track.credit, sort_order: track.sort_order }); }}><Edit3 /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => void request('track_update', { method: 'POST', body: JSON.stringify({ id: track.id, active: !track.active }) }, token).then(() => load(token))}>{track.active ? 'Pause' : 'Enable'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => void request('track_delete', { method: 'POST', body: JSON.stringify({ id: track.id }) }, token).then(() => load(token))}><Trash2 /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className={`${panel} card-body mt-6`}><h2 className="text-lg font-semibold">Ad submissions</h2><div className="mt-4 grid gap-2">{data.ads.length === 0 ? <p className="text-sm text-base-content/50">No submissions.</p> : data.ads.map((ad) => <div key={String(ad.id)} className="flex flex-wrap items-center gap-3 rounded-lg border border-base-content/10 p-3"><div className="flex-1"><strong>{String(ad.advertiser_name)}</strong><p className="text-xs text-base-content/50">{String(ad.status)} · {String(ad.duration_seconds)} seconds</p></div><button className="btn btn-ghost btn-sm" onClick={() => void request('ad', { method: 'POST', body: JSON.stringify({ id: ad.id, command: 'approve' }) }, token).then(() => load(token))}><Check /></button><button className="btn btn-ghost btn-sm" onClick={() => void request('ad', { method: 'POST', body: JSON.stringify({ id: ad.id, command: 'reject' }) }, token).then(() => load(token))}><X /></button><button className="btn btn-ghost btn-sm" onClick={() => void request('ad', { method: 'POST', body: JSON.stringify({ id: ad.id, command: 'delete' }) }, token).then(() => load(token))}><Trash2 /></button></div>)}</div></section>
      </div>
    </main>
  );
}
