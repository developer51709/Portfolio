import type { VercelRequest, VercelResponse } from '@vercel/node';

function script(origin: string) {
  return `#!/usr/bin/env bash
set -euo pipefail
API="${origin}/api/lofi"
WORK="$(mktemp -d -t lofi.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT INT TERM
need(){ command -v "$1" >/dev/null 2>&1; }

# ── Interactive dependency bootstrap ──────────────────────────────
install_missing(){
  local missing=()
  need curl || missing+=(curl)
  need ffmpeg || missing+=(ffmpeg)
  need python3 || missing+=(python3)
  need mkfifo || missing+=(coreutils)
  # ffprobe is optional; audio is decoded directly into the persistent pipe.
  if [ "\${#missing[@]}" -eq 0 ]; then return 0; fi

  local os installer packages answer prefix=""
  os="$(uname -s 2>/dev/null || echo unknown)"
  packages="\${missing[*]}"
  if [ "$os" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    installer="brew install ffmpeg python3"
  elif command -v apt-get >/dev/null 2>&1; then
    installer="apt-get update && apt-get install -y curl ffmpeg python3 coreutils"
    [ "$(id -u)" -eq 0 ] || installer="sudo $installer"
  elif command -v dnf >/dev/null 2>&1; then
    installer="dnf install -y curl ffmpeg python3 coreutils"
    [ "$(id -u)" -eq 0 ] || installer="sudo $installer"
  elif command -v yum >/dev/null 2>&1; then
    installer="yum install -y curl ffmpeg python3 coreutils"
    [ "$(id -u)" -eq 0 ] || installer="sudo $installer"
  elif command -v pacman >/dev/null 2>&1; then
    installer="pacman -Sy --noconfirm curl ffmpeg python"
    [ "$(id -u)" -eq 0 ] || installer="sudo $installer"
  elif command -v apk >/dev/null 2>&1; then
    installer="apk add --no-cache curl ffmpeg python3 coreutils"
    [ "$(id -u)" -eq 0 ] || installer="sudo $installer"
  elif command -v brew >/dev/null 2>&1; then
    installer="brew install ffmpeg python3"
  else
    echo "Missing dependencies: \${packages}"
    echo "Detected OS: \${os}; no supported package manager was found."
    echo "Install curl, ffmpeg, python3, ffprobe, and mkfifo, then run the stream again."
    return 1
  fi

  echo "Missing stream dependencies: \${packages}"
  echo "Detected OS: \${os}"
  echo "Install command: \${installer}"
  if [ ! -t 0 ] && [ ! -t 1 ]; then
    echo "Interactive confirmation is unavailable; run the command above manually."
    return 1
  fi
  read -r -p "Install these dependencies now? [y/N] " answer < /dev/tty || answer=""
  case "$answer" in
    y|Y|yes|YES) eval "$installer" || { echo "Dependency installation failed."; return 1; } ;;
    *) echo "Dependency installation cancelled."; return 1 ;;
  esac

  need curl && need ffmpeg && need python3 && need mkfifo || {
    echo "Installation completed, but one or more dependencies are still unavailable on PATH."
    return 1
  }
}

install_missing
HAS_FFPROBE=0

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
normalize_rtmp(){
  local value="$1"
  case "$value" in
    rtmp://live.twitch.tv/app|rtmp://live.twitch.tv/app/|rtmp://live.twitch.tv:1935/app|rtmp://live.twitch.tv:1935/app/)
      printf '%s' 'rtmps://live.twitch.tv:443/app' ;;
    rtmps://live.twitch.tv/app|rtmps://live.twitch.tv/app/)
      printf '%s' 'rtmps://live.twitch.tv:443/app' ;;
    *) printf '%s' "\${value%/}" ;;
  esac
}

RTMP="$(normalize_rtmp "$(value stream.rtmp_url)")"; KEY="$(value stream.stream_key)"; BG="$(value background_video_url)"
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
FEED_AUDIO=0
: > "$TRACK_LABEL_FILE"

[ -n "$RTMP" ] && [ -n "$KEY" ] || { echo "Configure the Twitch RTMP URL and stream key in the admin page first."; exit 1; }

# ── Escape helper for FFmpeg drawtext ─────────────────────────────
# Python avoids nested shell/sed escaping issues.
escape_dt(){ python3 -c "import sys; t=sys.argv[1]; print(t.replace(chr(92),chr(92)*2).replace(':',chr(92)+':').replace(chr(39),chr(92)+chr(39)))" "$1"; }

# ── Download track library ────────────────────────────────────────
TRACKS_DIR="$WORK/tracks"; mkdir -p "$TRACKS_DIR"
PLAYLIST="$WORK/playlist.txt"; META_DIR="$WORK/meta"; mkdir -p "$META_DIR"
AUDIO_PIPE="$WORK/audio.concat"; mkfifo "$AUDIO_PIPE"

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

start_audio_feeder(){
  python3 - "\${PLAYLIST}" "\${META_DIR}" "\${TRACK_LABEL_FILE}" "\${AUDIO_PIPE}" "\${CONFIG}" "\${HAS_FFPROBE}" <<'FEED' &
import hashlib, json, os, subprocess, sys, time
playlist, meta_dir, label_file, audio_pipe, config_file, has_ffprobe = sys.argv[1:]

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

def signature():
    try:
        with open(config_file) as f: cfg = json.load(f)
        tracks = cfg.get('track', {}).get('library', [])
        identity = [{k: t.get(k, '') for k in ('id', 'storage_path', 'sort_order', 'active')} for t in tracks]
        return hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    except (OSError, ValueError):
        return ''

def reload_tracks():
    # The parent shell refreshes CONFIG and playlist; this just rereads them.
    return paths()

def write_label(value):
    temp = label_file + '.tmp'
    with open(temp, 'w') as f: f.write(value)
    os.replace(temp, label_file)

current_signature = signature()
index = 0
with open(audio_pipe, 'wb') as pipe:
    while True:
        current = reload_tracks()
        if not current:
            time.sleep(1)
            continue
        if index >= len(current):
            index = 0
        path = current[index]
        if not os.path.isfile(path):
            index += 1
            continue
        stem = os.path.splitext(os.path.basename(path))[0]
        try:
            with open(os.path.join(meta_dir, stem + '.json')) as f: meta = json.load(f)
        except (OSError, ValueError):
            meta = {}
        title = str(meta.get('title', '')).strip()
        artist = str(meta.get('artist', '')).strip()
        write_label(title + (' — ' + artist if artist else ''))
        # Decode one track into the persistent raw PCM pipe. FFmpeg's main
        # publisher keeps reading this stream, so the Twitch connection never
        # closes between tracks.
        try:
            subprocess.run([
                'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', path,
                '-f', 's16le', '-ar', '44100', '-ac', '2', '-'
            ], stdout=pipe, stderr=subprocess.DEVNULL, check=False)
        except OSError:
            time.sleep(1)
        new_signature = signature()
        if new_signature and new_signature != current_signature:
            current_signature = new_signature
            index = 0
        else:
            index += 1
FEED
  LABEL_PID=$!
}

stop_audio_feeder(){
  if [ -n "\${LABEL_PID}" ]; then
    kill "\${LABEL_PID}" 2>/dev/null || true
    wait "\${LABEL_PID}" 2>/dev/null || true
    LABEL_PID=""
  fi
}

# ── Keep FFmpeg connected; the feeder changes tracks independently ──
FFMPEG_PID=""
RESTART_REQUESTED=0
run_ffmpeg(){
  ffmpeg "$@" &
  FFMPEG_PID=$!
  if [ "$FEED_AUDIO" -eq 1 ]; then start_audio_feeder; fi
  while kill -0 "$FFMPEG_PID" 2>/dev/null; do
    sleep 5
    if ! fetch_config; then continue; fi
    # Overlay files are hot-reloaded by FFmpeg; no process restart is needed.
    OVERLAY_TEXT="$(value overlay.text)"
    CREDIT_TEXT="$(value lofi.credit_text)"
    write_overlay_files
    NEW_TRACK_VERSION="$(track_signature)"
    if [ -n "$NEW_TRACK_VERSION" ] && [ "$NEW_TRACK_VERSION" != "$TRACK_VERSION" ]; then
      download_tracks
      TRACK_VERSION="$NEW_TRACK_VERSION"
    fi
  done
  wait "$FFMPEG_PID" 2>/dev/null || true
  FFMPEG_PID=""
  stop_audio_feeder
  FEED_AUDIO=0
}

# ── Play the complete playlist in one continuous stream ───────────
play_playlist(){
  write_overlay_files
  FEED_AUDIO=1
  local FILTERS
  FILTERS=\$(build_filters)

  echo "[\$(date +%H:%M:%S)] Playing \${TRACK_COUNT} tracks in one continuous stream"

  if [ -n "\${BG}" ]; then
    run_ffmpeg -hide_banner -loglevel error \\
      -stream_loop -1 -re -i "\${BG}" \\
      -f s16le -ar 44100 -ac 2 -i "\${AUDIO_PIPE}" \\
      -map 0:v -map 1:a \\
      -vf "\${FILTERS}" \\
      -c:v libx264 -preset "\${PRESET}" -b:v "\${VBR}" -maxrate "\${VBR}" -bufsize 9000k \\
      -pix_fmt yuv420p -r "\${FPS}" -g \$((FPS * 2)) \\
      -c:a aac -b:a "\${ABR}" -ar 44100 -ac 2 \\
      -f flv -rtmp_live live -rw_timeout 15000000 -flvflags no_duration_filesize "\${RTMP%/}/\${KEY}" || true
  else
    run_ffmpeg -hide_banner -loglevel error \\
      -f lavfi -i "color=c=0x0b0b11:s=\${RES}:r=\${FPS}" \\
      -f s16le -ar 44100 -ac 2 -i "\${AUDIO_PIPE}" \\
      -map 0:v -map 1:a \\
      -vf "\${FILTERS}" \\
      -c:v libx264 -preset "\${PRESET}" -b:v "\${VBR}" -maxrate "\${VBR}" -bufsize 9000k \\
      -pix_fmt yuv420p -r "\${FPS}" -g \$((FPS * 2)) \\
      -c:a aac -b:a "\${ABR}" -ar 44100 -ac 2 \\
      -f flv -rtmp_live live -rw_timeout 15000000 -flvflags no_duration_filesize "\${RTMP%/}/\${KEY}" || true
  fi
}

echo "Starting the self-contained FFmpeg host. OBS/browser source is not used."

while :; do
  fetch_config || true
  RTMP="\$(normalize_rtmp "\$(value stream.rtmp_url)")"; KEY="\$(value stream.stream_key)"; BG="\$(value background_video_url)"
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
    FEED_AUDIO=0
    SAFE_TEXT=\$(escape_dt "\${OVERLAY_TEXT}")
    SAFE_CREDIT=\$(escape_dt "\${CREDIT_TEXT}")
    FILTERS=\$(build_filters)
    if [ -n "\${BG}" ]; then
      run_ffmpeg -hide_banner -loglevel error \\
        -stream_loop -1 -re -i "\${BG}" \\
        -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \\
        -map 0:v -map 1:a \\
        -vf "\${FILTERS}" \\
        -c:v libx264 -preset "\${PRESET}" -b:v "\${VBR}" -maxrate "\${VBR}" -bufsize 9000k \\
        -pix_fmt yuv420p -r "\${FPS}" -g \$((FPS * 2)) \\
        -c:a aac -b:a "\${ABR}" -ar 44100 -ac 2 \\
        -f flv -rtmp_live live -rw_timeout 15000000 -flvflags no_duration_filesize "\${RTMP%/}/\${KEY}" || true
    else
      run_ffmpeg -hide_banner -loglevel error \\
        -f lavfi -i "color=c=0x0b0b11:s=\${RES}:r=\${FPS}" \\
        -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \\
        -map 0:v -map 1:a \\
        -vf "\${FILTERS}" \\
        -c:v libx264 -preset "\${PRESET}" -b:v "\${VBR}" -maxrate "\${VBR}" -bufsize 9000k \\
        -pix_fmt yuv420p -r "\${FPS}" -g \$((FPS * 2)) \\
        -c:a aac -b:a "\${ABR}" -ar 44100 -ac 2 \\
        -f flv -rtmp_live live -rw_timeout 15000000 -flvflags no_duration_filesize "\${RTMP%/}/\${KEY}" || true
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
