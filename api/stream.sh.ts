import type { VercelRequest, VercelResponse } from '@vercel/node';

function script(origin: string) {
  return `#!/usr/bin/env bash
set -euo pipefail
API="${origin}/api/lofi"
WORK="$(mktemp -d -t lofi.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT INT TERM
need(){ command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need curl; need ffmpeg; need ffprobe; need python3

# ── Authentication ────────────────────────────────────────────────
read -rsp "Lofi admin phrase: " PHRASE; echo
printf '%s' "$PHRASE" | python3 -c 'import json,sys; print(json.dumps({"phrase":sys.stdin.read()}))' > "$WORK/login.json"
AUTH=$(curl -fsS -X POST "$API?action=login" -H 'content-type: application/json' --data-binary "@$WORK/login.json") || { echo "Authentication failed"; exit 1; }
TOKEN=$(printf '%s' "$AUTH" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

# ── Config helpers ────────────────────────────────────────────────
CONFIG="$WORK/config.json"
fetch_config(){ curl -fsS "$API?action=config" -H "x-lofi-token: $TOKEN" -o "$CONFIG"; }
fetch_config || { echo "Could not fetch stream configuration"; exit 1; }
value(){ python3 - "$CONFIG" "$1" <<'PY'
import json,sys
v=json.load(open(sys.argv[1]))
for key in sys.argv[2].strip('.').split('.'):
  v=v.get(key,'') if isinstance(v,dict) else ''
print(v if v is not None else '')
PY
}

# ── Read settings ─────────────────────────────────────────────────
RTMP="$(value stream.rtmp_url)"; KEY="$(value stream.stream_key)"; BG="$(value background_video_url)"
RES="$(value stream.resolution)"; RES="\${RES:-1920x1080}"
FPS="$(value stream.fps)"; FPS="\${FPS:-30}"
VBR="$(value stream.video_bitrate)"; VBR="\${VBR:-4500k}"
ABR="$(value stream.audio_bitrate)"; ABR="\${ABR:-160k}"
PRESET="$(value stream.preset)"; PRESET="\${PRESET:-veryfast}"
OVERLAY_TEXT="$(value overlay.text)"
CREDIT_TEXT="$(value lofi.credit_text)"
SAFE_TEXT=""
SAFE_CREDIT=""
OVERLAY_FILE="$WORK/overlay.txt"
CREDIT_FILE="$WORK/credit.txt"
TRACK_LABEL_FILE="$WORK/track-label.txt"
TRACK_VERSION=""
LABEL_PID=""
: > "$TRACK_LABEL_FILE"

[ -n "$RTMP" ] && [ -n "$KEY" ] || { echo "Configure the Twitch RTMP URL and stream key in the admin page first."; exit 1; }

# ── Escape helper for FFmpeg drawtext ─────────────────────────────
# Python avoids nested shell/sed escaping issues.
escape_dt(){ python3 -c "import sys; t=sys.argv[1]; print(t.replace(chr(92),chr(92)*2).replace(':',chr(92)+':').replace(chr(39),chr(92)+chr(39)))" "$1"; }

# ── Download track library ────────────────────────────────────────
TRACKS_DIR="$WORK/tracks"; mkdir -p "$TRACKS_DIR"
PLAYLIST="$WORK/playlist.txt"; META_DIR="$WORK/meta"; mkdir -p "$META_DIR"

download_tracks(){
  > "$PLAYLIST"
  python3 - "$CONFIG" "$TRACKS_DIR" "$PLAYLIST" "$META_DIR" <<'DL'
import json,sys,os,urllib.request
cfg,td,pf,md = sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]
with open(cfg) as f: c=json.load(f)
lib = c.get("track",{}).get("library",[])
for i,t in enumerate(lib):
  url = t.get("storage_path","")
  if not url: continue
  ext = url.split("?")[0].rsplit(".",1)[-1] if "." in url.split("?")[0] else "mp3"
  out = os.path.join(td, f"{i:04d}.{ext}")
  if not os.path.exists(out):
    try:
      req = urllib.request.Request(url, headers={"User-Agent": "lofi-stream-host/1.0", "Accept": "audio/*,*/*;q=0.8"})
      with urllib.request.urlopen(req, timeout=60) as response, open(out, "wb") as output:
        output.write(response.read())
    except Exception as e:
      print(f"DL fail {t.get('title','?')}: {e}")
      continue
  with open(os.path.join(md, f"{i:04d}.json"),"w") as f:
    json.dump({"title":t.get("title",""),"artist":t.get("artist",""),"credit":t.get("credit","")}, f)
  with open(pf,"a") as f:
    # The downloaded paths are temporary and contain no shell metacharacters;
    # quote them in concat-demuxer format so FFmpeg reads each as one filename.
    print("file '" + os.path.abspath(out).replace("'", "'\\\\''") + "'", file=f)
DL
  grep -c "^file " "$PLAYLIST" 2>/dev/null || echo 0
}

download_tracks
TRACK_COUNT=$(wc -l < "$PLAYLIST" 2>/dev/null | tr -d ' ')
echo "Downloaded $TRACK_COUNT tracks."

# ── Build FFmpeg overlay filter chain ─────────────────────────────
write_overlay_files(){
  # FFmpeg's drawtext reload=1 rereads these files while the process runs.
  # Updating them does not interrupt the RTMP connection or audio stream.
  printf '%s' "\${OVERLAY_TEXT}" > "\${OVERLAY_FILE}.tmp"
  mv -f "\${OVERLAY_FILE}.tmp" "\${OVERLAY_FILE}"
  printf '%s' "\${CREDIT_TEXT}" > "\${CREDIT_FILE}.tmp"
  mv -f "\${CREDIT_FILE}.tmp" "\${CREDIT_FILE}"
}

track_signature(){
  python3 - "\${CONFIG}" <<'PY'
import hashlib,json,sys
with open(sys.argv[1]) as f: cfg=json.load(f)
tracks=cfg.get('track',{}).get('library',[])
identity=[{
  'id': t.get('id',''),
  'storage_path': t.get('storage_path',''),
  'sort_order': t.get('sort_order',0),
  'active': t.get('active',True),
} for t in tracks]
print(hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(',',':')).encode()).hexdigest())
PY
}

build_filters(){
  printf '%s' "drawbox=x=0:y=ih-120:w=iw:h=120:color=black@0.55:t=fill,drawtext=textfile=\${OVERLAY_FILE}:reload=1:fontcolor=white:fontsize=36:x=40:y=h-100:font=Sans:borderw=2:bordercolor=black@0.6,drawtext=textfile=\${CREDIT_FILE}:reload=1:fontcolor=white@0.7:fontsize=22:x=40:y=h-55:font=Sans:borderw=1:bordercolor=black@0.4,drawtext=textfile=\${TRACK_LABEL_FILE}:reload=1:fontcolor=white:fontsize=28:x=w-tw-40:y=h-95:font=Sans:borderw=2:bordercolor=black@0.5"
}

start_track_label_updater(){
  : > "\${TRACK_LABEL_FILE}"
  python3 - "\${PLAYLIST}" "\${META_DIR}" "\${TRACK_LABEL_FILE}" <<'LABELS' &
import json, os, subprocess, sys, time
playlist, meta_dir, label_file = sys.argv[1:]

def paths():
    result = []
    try:
        with open(playlist) as f:
            for line in f:
                line = line.rstrip('\\n')
                if line.startswith("file '") and line.endswith("'"):
                    result.append(line[6:-1])
    except OSError:
        pass
    return result

def write_label(value):
    temp = label_file + '.tmp'
    with open(temp, 'w') as f:
        f.write(value)
    os.replace(temp, label_file)

while True:
    current = paths()
    if not current:
        time.sleep(1)
        continue
    for path in current:
        if not os.path.isfile(path):
            continue
        stem = os.path.splitext(os.path.basename(path))[0]
        try:
            with open(os.path.join(meta_dir, stem + '.json')) as f:
                meta = json.load(f)
        except (OSError, ValueError):
            meta = {}
        title = str(meta.get('title', '')).strip()
        artist = str(meta.get('artist', '')).strip()
        label = title + (' — ' + artist if artist else '')
        write_label(label)
        try:
            duration = float(subprocess.check_output([
                'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1', path
            ], text=True, stderr=subprocess.DEVNULL).strip())
        except (OSError, ValueError, subprocess.CalledProcessError):
            duration = 180.0
        time.sleep(max(1.0, duration))
LABELS
  LABEL_PID=$!
}

stop_track_label_updater(){
  if [ -n "\${LABEL_PID}" ]; then
    kill "\${LABEL_PID}" 2>/dev/null || true
    wait "\${LABEL_PID}" 2>/dev/null || true
    LABEL_PID=""
  fi
}

# ── Restart FFmpeg only when the track playlist changes ───────────
FFMPEG_PID=""
RESTART_REQUESTED=0
run_ffmpeg(){
  ffmpeg "$@" &
  FFMPEG_PID=$!
  while kill -0 "$FFMPEG_PID" 2>/dev/null; do
    sleep 5
    if ! fetch_config; then continue; fi
    # Overlay files are hot-reloaded by FFmpeg; no process restart is needed.
    OVERLAY_TEXT="$(value overlay.text)"
    CREDIT_TEXT="$(value lofi.credit_text)"
    write_overlay_files
    NEW_TRACK_VERSION="$(track_signature)"
    if [ -n "$NEW_TRACK_VERSION" ] && [ "$NEW_TRACK_VERSION" != "$TRACK_VERSION" ]; then
      echo "Track playlist changed; rebuilding the audio playlist..."
      RESTART_REQUESTED=1
      kill "$FFMPEG_PID" 2>/dev/null || true
      break
    fi
  done
  wait "$FFMPEG_PID" 2>/dev/null || true
  FFMPEG_PID=""
  stop_track_label_updater
}

# ── Play the complete playlist in one continuous stream ───────────
play_playlist(){
  write_overlay_files
  start_track_label_updater
  local FILTERS
  FILTERS=\$(build_filters)

  echo "[\$(date +%H:%M:%S)] Playing \${TRACK_COUNT} tracks in one continuous stream"

  if [ -n "\${BG}" ]; then
    run_ffmpeg -hide_banner -loglevel error \\
      -stream_loop -1 -re -i "\${BG}" \\
      -stream_loop -1 -f concat -safe 0 -i "\${PLAYLIST}" \\
      -map 0:v -map 1:a \\
      -vf "\${FILTERS}" \\
      -c:v libx264 -preset "\${PRESET}" -b:v "\${VBR}" -maxrate "\${VBR}" -bufsize 9000k \\
      -pix_fmt yuv420p -r "\${FPS}" -g \$((FPS * 2)) \\
      -c:a aac -b:a "\${ABR}" -ar 44100 -ac 2 \\
      -f flv "\${RTMP%/}/\${KEY}" || true
  else
    run_ffmpeg -hide_banner -loglevel error \\
      -f lavfi -i "color=c=0x0b0b11:s=\${RES}:r=\${FPS}" \\
      -stream_loop -1 -f concat -safe 0 -i "\${PLAYLIST}" \\
      -map 0:v -map 1:a \\
      -vf "\${FILTERS}" \\
      -c:v libx264 -preset "\${PRESET}" -b:v "\${VBR}" -maxrate "\${VBR}" -bufsize 9000k \\
      -pix_fmt yuv420p -r "\${FPS}" -g \$((FPS * 2)) \\
      -c:a aac -b:a "\${ABR}" -ar 44100 -ac 2 \\
      -f flv "\${RTMP%/}/\${KEY}" || true
  fi
}

echo "Starting the self-contained FFmpeg host. OBS/browser source is not used."

while :; do
  fetch_config || true
  RTMP="\$(value stream.rtmp_url)"; KEY="\$(value stream.stream_key)"; BG="\$(value background_video_url)"
  OVERLAY_TEXT="\$(value overlay.text)"; CREDIT_TEXT="\$(value lofi.credit_text)"
  TRACK_VERSION=\$(track_signature)
  write_overlay_files
  RESTART_REQUESTED=0

  download_tracks
  TRACK_COUNT=\$(wc -l < "\${PLAYLIST}" 2>/dev/null | tr -d ' ')

  if [ "\${TRACK_COUNT}" -gt 0 ]; then
    # Keep one FFmpeg/RTMP session alive across every track transition.
    # run_ffmpeg interrupts this process only when the playlist changes.
    play_playlist
  else
    # No tracks — play with silence and overlay
    SAFE_TEXT=\$(escape_dt "\${OVERLAY_TEXT}")
    SAFE_CREDIT=\$(escape_dt "\${CREDIT_TEXT}")
    FILTERS=\$(build_filters)
    if [ -n "\${BG}" ]; then
      run_ffmpeg -hide_banner -loglevel warning \\
        -stream_loop -1 -re -i "\${BG}" \\
        -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \\
        -map 0:v -map 1:a \\
        -vf "\${FILTERS}" \\
        -c:v libx264 -preset "\${PRESET}" -b:v "\${VBR}" -maxrate "\${VBR}" -bufsize 9000k \\
        -pix_fmt yuv420p -r "\${FPS}" -g \$((FPS * 2)) \\
        -c:a aac -b:a "\${ABR}" -ar 44100 -ac 2 \\
        -f flv "\${RTMP%/}/\${KEY}" || true
    else
      run_ffmpeg -hide_banner -loglevel warning \\
        -f lavfi -i "color=c=0x0b0b11:s=\${RES}:r=\${FPS}" \\
        -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \\
        -map 0:v -map 1:a \\
        -vf "\${FILTERS}" \\
        -c:v libx264 -preset "\${PRESET}" -b:v "\${VBR}" -maxrate "\${VBR}" -bufsize 9000k \\
        -pix_fmt yuv420p -r "\${FPS}" -g \$((FPS * 2)) \\
        -c:a aac -b:a "\${ABR}" -ar 44100 -ac 2 \\
        -f flv "\${RTMP%/}/\${KEY}" || true
    fi
  fi

  echo "Playlist finished. Re-fetching config and tracks..."
  sleep 3
done
`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).send('GET required');
  const forwarded = req.headers['x-forwarded-proto'];
  const host = req.headers.host ?? 'localhost';
  const origin = `${forwarded ?? 'https'}://${host}`;
  res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(script(origin));
}
