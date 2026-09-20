"use client";

import { useEffect, useRef } from "react";
import { api, API_URL, getToken } from "@/lib/api";

/**
 * Opens the notification SSE stream and calls `onMessage` with the parsed
 * payload on every push. Reconnects automatically — on error it first hits
 * api() so an expired access token gets refreshed, then reconnects with the
 * new token. Safe to mount in several components at once (each gets its own
 * lightweight stream).
 */
export function useNotifyStream(onMessage: (data: { unread: number; items: unknown[] }) => void) {
  const cb = useRef(onMessage);
  cb.current = onMessage;

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = async () => {
      if (closed) return;
      const token = getToken();
      if (!token) return;
      es = new EventSource(`${API_URL}/notifications/stream?token=${encodeURIComponent(token)}`);
      es.onmessage = (e) => {
        try { cb.current(JSON.parse(e.data)); } catch { /* ignore */ }
      };
      es.onerror = () => {
        es?.close();
        retry = setTimeout(async () => {
          if (closed) return;
          try { await api("/notifications"); } catch { /* still retry */ }
          connect();
        }, 5000);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, []);
}
