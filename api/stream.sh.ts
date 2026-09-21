import type { VercelRequest, VercelResponse } from '@vercel/node';

function script(origin: string) {
  return `#!/usr/bin/env bash
set -euo pipefail
API="${origin}/api/lofi"
WORK="$(mktemp -d -t lofi.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT INT TERM
need(){ command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }; }
need curl; need ffmpeg
read -rsp "Lofi admin phrase: " PHRASE; echo
printf '%s' "$PHRASE" | python3 -c 'import json,sys; print(json.dumps({"phrase":sys.stdin.read()}))' > "$WORK/login.json"
AUTH=$(curl -fsS -X POST "$API?action=login" -H 'content-type: application/json' --data-binary "@$WORK/login.json") || { echo "Authentication failed"; exit 1; }
TOKEN=$(printf '%s' "$AUTH" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
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
RTMP="$(value stream.rtmp_url)"; KEY="$(value stream.stream_key)"; BG="$(value background_video_url)"
RES="$(value stream.resolution)"; RES="\${RES:-1920x1080}"
FPS="$(value stream.fps)"; FPS="\${FPS:-30}"
VBR="$(value stream.video_bitrate)"; VBR="\${VBR:-4500k}"
ABR="$(value stream.audio_bitrate)"; ABR="\${ABR:-160k}"
PRESET="$(value stream.preset)"; PRESET="\${PRESET:-veryfast}"
[ -n "$RTMP" ] && [ -n "$KEY" ] || { echo "Configure the Twitch RTMP URL and stream key in the admin page first."; exit 1; }
VIDEO=(-f lavfi -i "color=c=0x0b0b11:s=$RES:r=$FPS")
[ -n "$BG" ] && VIDEO=(-stream_loop -1 -re -i "$BG")
AUDIO=(-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100)
PLAYLIST="$(value track.playlist_url)"
[ -n "$PLAYLIST" ] && AUDIO=(-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 -i "$PLAYLIST")
echo "Starting the self-contained FFmpeg host. OBS/browser source is not used."
while :; do
  ffmpeg -hide_banner -loglevel warning "\${VIDEO[@]}" "\${AUDIO[@]}" \\
    -map 0:v -map 1:a -c:v libx264 -preset "$PRESET" -b:v "$VBR" -maxrate "$VBR" -bufsize 9000k \\
    -pix_fmt yuv420p -r "$FPS" -g $((FPS * 2)) -c:a aac -b:a "$ABR" -ar 44100 \\
    -f flv "\${RTMP%/}/$KEY" || true
  sleep 5
  fetch_config || true
  RTMP="$(value stream.rtmp_url)"; KEY="$(value stream.stream_key)"; BG="$(value background_video_url)"
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
