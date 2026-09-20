"use client";

import { useEffect, useRef, useState } from "react";
import { api, API_URL, getToken } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Item = { id: string; title: string; body: string; read: boolean; created_at: string | null };

export function NotifyBell() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const ref = useRef<HTMLDivElement>(null);

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
        try {
          const data = JSON.parse(e.data);
          setUnread(data.unread);
          setItems(data.items);
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es?.close();
        // Token may have expired (15-min TTL) — refresh via api() then reconnect.
        retry = setTimeout(async () => {
          if (closed) return;
          try { await api("/notifications"); } catch { /* still retry via connect */ }
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

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const markAll = async () => {
    await api("/notifications/read-all", { method: "POST" }).catch(() => {});
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label={t("notifications")}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-surface transition hover:border-white/20">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-black">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-11 z-50 w-80 max-w-[90vw]">
          <div className="menu max-h-96 overflow-y-auto p-2">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-xs font-medium">{t("notifications")}</p>
              {unread > 0 && (
                <button onClick={markAll} className="text-[10px] text-accent hover:underline">
                  {t("mark_all_read")}
                </button>
              )}
            </div>
            {items.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">{t("no_notifications")}</p>}
            {items.map((n) => (
              <button key={n.id}
                onClick={() => api(`/notifications/${n.id}/read`, { method: "POST" }).then(() => {
                  setItems((xs) => xs.map((x) => x.id === n.id ? { ...x, read: true } : x));
                  setUnread((u) => Math.max(0, u - (n.read ? 0 : 1)));
                }).catch(() => {})}
                className={`block w-full rounded-xl px-3 py-2.5 text-start transition hover:bg-white/5 ${n.read ? "opacity-50" : ""}`}>
                <p className="text-xs font-medium">{n.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{n.body}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
