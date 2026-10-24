"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime, useT } from "@/lib/i18n";
import { GlassCard } from "@/components/Glass";
import { Pager, PAGE_SIZE } from "@/components/Pager";
import { useToast } from "@/components/Toast";

type Member = { id: string; label: string };
type Filter = "open" | "urgent" | "overdue" | "all" | "paid" | "rejected";
export type WithdrawalView = { user: Member | null; filter: Filter; nonce: number };
type Withdrawal = {
  id: string; user_id: string; user_full_name: string | null; user_email: string | null;
  user_serial: string | null; amount: number; fee: number; star_penalty: number;
  net_payout: number; status: string; address: string; txid: string; admin_note: string;
  created_at: string; processed_at: string | null; due_at: string;
};
type History = {
  items: Withdrawal[]; total: number; server_now: string;
  summary: { total: number; open_count: number; open_net: number; paid_count: number;
    paid_net: number; due_soon_count: number; overdue_count: number; urgent_net: number };
};
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusTone: Record<string, string> = {
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  approved: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  paid: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  rejected: "border-red-400/30 bg-red-400/10 text-red-300",
};

export function WithdrawalsPanel({ view, onProcessed }: { view: WithdrawalView; onProcessed: () => void }) {
  const { t, terr, lang } = useT();
  const { toast } = useToast();
  const [user, setUser] = useState(view.user);
  const [filter, setFilter] = useState<Filter>(view.filter);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  const clock = useRef({ server: Date.now(), received: performance.now() });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [txid, setTxid] = useState("");
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    setUser(view.user); setFilter(view.filter); setPage(0);
    setSearch(""); setQuery(""); setPayingId(null); setTxid("");
  }, [view]);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight || acting.current) return;
      inFlight = true;
      const params = new URLSearchParams({ status: filter, offset: String(page * PAGE_SIZE), limit: String(PAGE_SIZE) });
      if (user) params.set("user_id", user.id);
      if (query) params.set("q", query);
      try {
        const result = await api<History>(`/admin/withdrawals/history?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const last = Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1);
        if (page > last) { setPage(last); return; }
        clock.current = { server: Date.parse(result.server_now), received: performance.now() };
        setNow(clock.current.server); setData(result); setError("");
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Failed");
      } finally { inFlight = false; }
    };
    setData(null); setError("");
    load();
    const poll = setInterval(load, 10000);
    return () => { controller.abort(); clearInterval(poll); };
  }, [user, filter, query, page, revision]);

  useEffect(() => {
    const tick = setInterval(() => setNow(clock.current.server + performance.now() - clock.current.received), 1000);
    return () => clearInterval(tick);
  }, []);

  const changeFilter = (value: Filter) => { setFilter(value); setPage(0); setPayingId(null); setTxid(""); };
  const history = (w: Withdrawal) => {
    setUser({ id: w.user_id, label: [w.user_full_name || w.user_email, w.user_serial].filter(Boolean).join(" · ") });
    setSearch(""); setQuery(""); changeFilter("all");
  };
  const copy = (value: string) => navigator.clipboard.writeText(value).then(() => toast(t("copied"))).catch(() => toast(t("failed"), "err"));
  const process = async (w: Withdrawal, action: "approve" | "paid" | "reject") => {
    if (acting.current) return;
    if (action === "paid" && !txid.trim()) { toast(t("txid_required"), "err"); return; }
    acting.current = true; setBusy(true);
    try {
      await api(`/admin/withdrawals/${w.id}/process`, {
        method: "POST", body: JSON.stringify({ action, txid: action === "paid" ? txid.trim() : "", note: "" }),
      });
      setPayingId(null); setTxid(""); setRevision((n) => n + 1); onProcessed();
    } catch (e) { toast(e instanceof Error ? terr(e.message) : t("failed"), "err"); }
    finally { acting.current = false; setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{t("wd_history")}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">{t("wd_policy")}</p>
          <p className="mt-1 text-[10px] text-muted">{t("wd_timezone", { zone })}</p>
        </div>
        {user && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
            <span className="text-xs font-medium">{user.label}</span>
            <button disabled={busy} className="text-xs text-accent underline" onClick={() => { setUser(null); changeFilter("all"); }}>
              {t("wd_all_users")}
            </button>
          </div>
        )}
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <GlassCard>
            <p className="text-xs text-muted">{t("wd_paid_total")}</p>
            <p className="mt-2 font-display text-2xl">${money(data.summary.paid_net)}</p>
            <p className="mt-1 text-xs text-muted">{t("wd_records", { n: data.summary.paid_count })}</p>
          </GlassCard>
          <GlassCard>
            <p className="text-xs text-muted">{t("wd_open")}</p>
            <p className="mt-2 font-display text-2xl">${money(data.summary.open_net)}</p>
            <p className="mt-1 text-xs text-muted">{t("wd_records", { n: data.summary.open_count })}</p>
          </GlassCard>
          <GlassCard className={data.summary.overdue_count ? "border-red-500/30" : ""}>
            <p className="text-xs text-muted">{t("wd_urgent")}</p>
            <p className="mt-2 font-display text-2xl">${money(data.summary.urgent_net)}</p>
            <button disabled={busy} onClick={() => changeFilter("urgent")} className="mt-1 text-start text-xs text-accent underline">
              {data.summary.due_soon_count} {t("wd_due_soon")} · {data.summary.overdue_count} {t("wd_overdue")}
            </button>
          </GlassCard>
        </div>
      )}

      <GlassCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(["open", "urgent", "overdue", "all", "paid", "rejected"] as Filter[]).map((value) => (
              <button key={value} disabled={busy} aria-pressed={filter === value} onClick={() => changeFilter(value)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${filter === value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-ink"}`}>
                {t(["open", "urgent", "overdue"].includes(value) ? `wd_${value}` : value)}
              </button>
            ))}
          </div>
          <input disabled={busy} aria-label={t("wd_search")} className="input w-full sm:max-w-xs" maxLength={120}
            placeholder={t("wd_search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {error && (
          <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-400/5 p-3 text-xs text-red-300">
            <span>{terr(error)}</span>
            <button className="underline" onClick={() => setRevision((n) => n + 1)}>{t("retry")}</button>
          </div>
        )}
        {!data && !error && <p role="status" className="py-10 text-center text-sm text-muted">{t("loading")}</p>}
        {data && data.items.length === 0 && <p className="py-10 text-center text-sm text-muted">{t("no_withdrawals")}</p>}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-border text-start text-[10px] uppercase tracking-wide text-muted">
                  {["user", "net_payout", "wd_requested", "wd_deadline", "address", "status", "actions"].map((key) => (
                    <th key={key} className="pb-3 pe-4 text-start font-medium">{t(key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>{data.items.map((w) => {
                const open = w.status === "pending" || w.status === "approved";
                const left = Date.parse(w.due_at) - now;
                const overdue = open && left <= 0;
                const soon = open && left > 0 && left <= 24 * 3600000;
                const minutes = Math.max(0, Math.ceil(Math.abs(left) / 60000));
                const tone = overdue ? "text-red-300" : soon ? "text-amber-300" : "text-muted";
                return (
                  <Fragment key={w.id}>
                    <tr className={`border-b border-border/70 align-top ${overdue ? "bg-red-500/[0.04]" : soon ? "bg-amber-500/[0.04]" : ""}`}>
                      <td className="min-w-40 py-4 pe-4">
                        <p className="text-xs font-medium">{w.user_full_name || w.user_email}</p>
                        <p className="mt-1 font-mono text-[10px] text-accent">{w.user_serial}</p>
                        {w.user_full_name && <p className="mt-1 break-all text-[10px] text-muted">{w.user_email}</p>}
                        {!user && <button disabled={busy} onClick={() => history(w)} className="mt-2 text-xs text-accent underline">{t("wd_history")}</button>}
                      </td>
                      <td className="whitespace-nowrap py-4 pe-4">
                        <p className="font-display text-lg text-accent">${money(w.net_payout)}</p>
                        <p className="mt-1 text-[10px] text-muted">${money(w.amount)} − ${money(w.fee)} {t("fee_removed")}</p>
                        {w.star_penalty > 0 && <p className="mt-1 text-[10px] text-muted">−${money(w.star_penalty)} {t("star_penalty")}</p>}
                      </td>
                      <td className="whitespace-nowrap py-4 pe-4 text-xs text-muted">
                        <time dateTime={w.created_at}>{formatDateTime(w.created_at, lang)}</time>
                        {w.processed_at && <div className="mt-2 text-[10px]">
                          <p>{t(w.status === "paid" ? "wd_paid_at" : "wd_processed")}</p>
                          <time dateTime={w.processed_at}>{formatDateTime(w.processed_at, lang)}</time>
                        </div>}
                      </td>
                      <td className={`whitespace-nowrap py-4 pe-4 text-xs ${tone}`}>
                        <time dateTime={w.due_at}>{formatDateTime(w.due_at, lang)}</time>
                        {open && <p className="mt-2 font-medium tabular-nums">{t(overdue ? "wd_late" : "wd_remaining", { h: Math.floor(minutes / 60), m: minutes % 60 })}</p>}
                        {(soon || overdue) && <span className="mt-2 inline-block rounded-full border border-current px-2 py-0.5 text-[10px]">{t(overdue ? "wd_overdue" : "wd_due_soon")}</span>}
                      </td>
                      <td className="min-w-40 max-w-56 py-4 pe-4">
                        <button onClick={() => copy(w.address)} title={t("copy")} className="break-all text-start font-mono text-[10px] leading-relaxed text-ink/80 hover:text-accent">{w.address}</button>
                        {w.txid && <button onClick={() => copy(w.txid)} title={t("copy")} className="mt-2 block break-all text-start font-mono text-[10px] text-accent">{t("txid")}: {w.txid}</button>}
                      </td>
                      <td className="py-4 pe-4">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] ${statusTone[w.status] ?? "border-border text-muted"}`}>{t(w.status)}</span>
                        {w.admin_note && <p className="mt-2 max-w-44 text-xs text-muted">{w.admin_note}</p>}
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {w.status === "pending" && <button disabled={busy || !!error} className="btn-ghost px-3 py-1 text-xs" onClick={() => process(w, "approve")}>{t("approve")}</button>}
                          {open && <>
                            <button disabled={busy || !!error} className="btn px-3 py-1 text-xs" onClick={() => { setPayingId(payingId === w.id ? null : w.id); setTxid(""); }}>{t("mark_paid")}</button>
                            <button disabled={busy || !!error} className="rounded-full border border-red-400/25 px-3 py-1 text-xs text-red-300" onClick={() => process(w, "reject")}>{t("reject")}</button>
                          </>}
                        </div>
                      </td>
                    </tr>
                    {payingId === w.id && open && <tr className="border-b border-border bg-accent/5">
                      <td colSpan={7} className="p-3">
                        <form onSubmit={(e) => { e.preventDefault(); process(w, "paid"); }} className="flex flex-wrap items-center gap-2">
                          <label htmlFor={`txid-${w.id}`} className="text-xs">{t("txid")}</label>
                          <input id={`txid-${w.id}`} autoFocus disabled={busy} required maxLength={255} className="input min-w-48 flex-1" value={txid} onChange={(e) => setTxid(e.target.value)} placeholder={t("txid_ph")} />
                          <button disabled={busy || !!error} className="btn px-4 py-1.5 text-xs" type="submit">{busy ? t("loading") : t("confirm")}</button>
                          <button disabled={busy} className="btn-ghost px-3 py-1.5 text-xs" type="button" onClick={() => { setPayingId(null); setTxid(""); }}>{t("cancel")}</button>
                        </form>
                      </td>
                    </tr>}
                  </Fragment>
                );
              })}</tbody>
            </table>
          </div>
        )}
        {data && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">{t("wd_records", { n: data.total })}</p>
          <Pager total={data.total} page={page} setPage={(n) => { if (!busy) { setPage(n); setPayingId(null); } }} />
        </div>}
      </GlassCard>
    </div>
  );
}
