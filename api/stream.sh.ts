import type { VercelRequest, VercelResponse } from '@vercel/node';

function script(origin: string) {
  return `#!/usr/bin/env bash
set -euo pipefail
API="${origin}/api/lofi"
WORK="$(mktemp -d -t lofi.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT INT TERM
need(){ command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need curl; need ffmpeg; need python3

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
  with open(pf,"a") as f: print(os.path.abspath(out), file=f)
DL
  grep -c "^file " "$PLAYLIST" 2>/dev/null || echo 0
}

download_tracks
TRACK_COUNT=$(wc -l < "$PLAYLIST" 2>/dev/null | tr -d ' ')
echo "Downloaded $TRACK_COUNT tracks."

# ── Build FFmpeg overlay filter chain ─────────────────────────────
build_filters(){
  local f=""
  f="drawbox=x=0:y=ih-120:w=iw:h=120:color=black@0.55:t=fill"
  if [ -n "\${SAFE_TEXT}" ]; then
    f="\${f},drawtext=text='\${SAFE_TEXT}':fontcolor=white:fontsize=36:x=40:y=h-100:font=Sans:borderw=2:bordercolor=black@0.6"
  fi
  if [ -n "\${SAFE_CREDIT}" ]; then
    f="\${f},drawtext=text='\${SAFE_CREDIT}':fontcolor=white@0.7:fontsize=22:x=40:y=h-55:font=Sans:borderw=1:bordercolor=black@0.4"
  fi
  if [ -f "\${WORK}/track_label.txt" ]; then
    f="\${f},drawtext=textfile=\${WORK}/track_label.txt:fontcolor=white:fontsize=28:x=w-tw-40:y=h-95:font=Sans:borderw=2:bordercolor=black@0.5"
  fi
  printf '%s' "\${f}"
}

# ── Restart FFmpeg when admin settings change ─────────────────────
FFMPEG_PID=""
CONFIG_VERSION=""
RESTART_REQUESTED=0
run_ffmpeg(){
  ffmpeg "$@" &
  FFMPEG_PID=$!
  while kill -0 "$FFMPEG_PID" 2>/dev/null; do
    sleep 5
    if ! fetch_config; then continue; fi
    NEW_VERSION="$(value updated_at)"
    if [ -n "$NEW_VERSION" ] && [ "$NEW_VERSION" != "$CONFIG_VERSION" ]; then
      echo "Configuration changed in admin panel; restarting FFmpeg..."
      RESTART_REQUESTED=1
      kill "$FFMPEG_PID" 2>/dev/null || true
      break
    fi
  done
  wait "$FFMPEG_PID" 2>/dev/null || true
  FFMPEG_PID=""
}

# ── Play a single track with overlay ──────────────────────────────
play_track(){
  local track_url="\$1" idx="\$2"
  SAFE_CREDIT=\$(escape_dt "\${CREDIT_TEXT}")
  local meta="\${META_DIR}/\$(printf '%04d' "\$idx").json"
  if [ -f "\$meta" ]; then
    local title artist credit
    title=\$(python3 -c "import json; print(json.load(open('\$meta')).get('title',''))")
    artist=\$(python3 -c "import json; print(json.load(open('\$meta')).get('artist',''))")
    credit=\$(python3 -c "import json; print(json.load(open('\$meta')).get('credit',''))")
    printf '%s' "\${title} — \${artist}" > "\${WORK}/track_label.txt"
    [ -n "\$credit" ] && SAFE_CREDIT=\$(escape_dt "\$credit")
  fi

  SAFE_TEXT=\$(escape_dt "\${OVERLAY_TEXT}")
  local FILTERS
  FILTERS=\$(build_filters)

  local VIDEO
  if [ -n "\${BG}" ]; then
    VIDEO=(-stream_loop -1 -re -i "\${BG}")
  else
    VIDEO=(-f lavfi -i "color=c=0x0b0b11:s=\${RES}:r=\${FPS}")
  fi

  echo "[\$(date +%H:%M:%S)] Playing #\$((idx+1)): \$(cat "\${WORK}/track_label.txt" 2>/dev/null || echo 'unknown')"

  run_ffmpeg -hide_banner -loglevel error \\
    "\${VIDEO[@]}" \\
    -i "\${track_url}" \\
    -map 0:v -map 1:a \\
    -vf "\${FILTERS}" \\
    -c:v libx264 -preset "\${PRESET}" -b:v "\${VBR}" -maxrate "\${VBR}" -bufsize 9000k \\
    -pix_fmt yuv420p -r "\${FPS}" -g \$((FPS * 2)) \\
    -c:a aac -b:a "\${ABR}" -ar 44100 -ac 2 \\
    -shortest \\
    -f flv "\${RTMP%/}/\${KEY}" || true
}

echo "Starting the self-contained FFmpeg host. OBS/browser source is not used."

while :; do
  fetch_config || true
  RTMP="\$(value stream.rtmp_url)"; KEY="\$(value stream.stream_key)"; BG="\$(value background_video_url)"
  OVERLAY_TEXT="\$(value overlay.text)"; CREDIT_TEXT="\$(value lofi.credit_text)"
  CONFIG_VERSION="\$(value updated_at)"
  RESTART_REQUESTED=0

  download_tracks
  TRACK_COUNT=\$(wc -l < "\${PLAYLIST}" 2>/dev/null | tr -d ' ')

  if [ "\${TRACK_COUNT}" -gt 0 ]; then
    IDX=0
    while IFS= read -r line; do
      TRACK_URL="\${line}"
      if [ ! -f "\${TRACK_URL}" ]; then
        echo "Skipping missing downloaded track: \${TRACK_URL}"
        IDX=\$((IDX + 1))
        continue
      fi
      play_track "\${TRACK_URL}" "\${IDX}"
      if [ "\${RESTART_REQUESTED}" -eq 1 ]; then break; fi
      IDX=\$((IDX + 1))
    done < "\${PLAYLIST}"
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
