import { useEffect, useRef, useState } from 'react';
import { LanyardData } from '../interfaces/lanyard';

const LANYARD_WS = 'wss://api.lanyard.rest/socket';
const LANYARD_REST = 'https://api.lanyard.rest/v1/users';

const REST_POLL_INTERVAL = 30_000; // 30s polling fallback when WebSocket is unavailable

/**
 * Connects to Lanyard via WebSocket for real-time Discord presence.
 * On initial load and when WebSocket is unavailable (e.g. sandboxed iframes),
 * falls back to REST polling every 30 seconds.
 *
 * NOTE: The Discord user must be a member of the Lanyard server (discord.gg/lanyard)
 * for their presence data to be tracked.
 */
export function useLanyard(userId: string | undefined): {
  presence: LanyardData | null;
  loading: boolean;
} {
  const [presence, setPresence] = useState<LanyardData | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsAliveRef = useRef(false); // true once a WS message is received
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    wsAliveRef.current = false;
    setPresence(null);
    setLoading(Boolean(userId));
    if (!userId) return;

    const fetchRest = () =>
      fetch(`${LANYARD_REST}/${userId}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.success && mountedRef.current) setPresence(json.data);
        })
        .catch(() => {
          /* silently ignore REST errors */
        })
        // Either way the first answer settles it: no presence to show, or one
        // to show, never an open-ended skeleton.
        .finally(() => {
          if (mountedRef.current) setLoading(false);
        });

    // Immediate snapshot via REST so the card renders right away
    fetchRest();

    // REST polling fallback — active until WebSocket delivers its first message
    pollRef.current = setInterval(() => {
      if (!wsAliveRef.current) fetchRest();
    }, REST_POLL_INTERVAL);

    const connect = () => {
      if (!mountedRef.current) return;

      const ws = new WebSocket(LANYARD_WS);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        wsAliveRef.current = true;
        const { op, d, t } = JSON.parse(event.data as string);

        switch (op) {
          case 1: // Hello — start heartbeat and subscribe
            heartbeatRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ op: 3 }));
              }
            }, d.heartbeat_interval);
            ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: userId } }));
            break;

          case 0: // Event — update presence on init or update
            if (t === 'INIT_STATE' || t === 'PRESENCE_UPDATE') {
              setPresence(d as LanyardData);
              setLoading(false);
            }
            break;
        }
      };

      ws.onclose = () => {
        wsAliveRef.current = false;
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        // Reconnect after 5 seconds if still mounted
        if (mountedRef.current) {
          reconnectRef.current = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      wsRef.current?.close();
    };
  }, [userId]);

  return { presence, loading };
}
