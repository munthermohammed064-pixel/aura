"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { CountUp } from "@/components/CountUp";
import { GlassCard } from "@/components/Glass";
import { api, API_URL, setTokens, clearTokens } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import { Stars } from "@/components/Stars";
import { Pager, PAGE_SIZE } from "@/components/Pager";

type Stats = Record<string, number>;
type Pkg = {
  id: string; name: string; description: string; min_deposit: number; max_deposit: number;
  yield_min_pct: number; yield_max_pct: number; return_min_amount: number | null;
  return_max_amount: number | null; duration_days: number; is_active: boolean; sort_order: number;
};
type Row = {
  id: string; amount: number; status: string; created_at: string; method?: string; proof?: string;
  screenshot?: string; address?: string; fee?: number; txid?: string;
  star_penalty?: number; net_payout?: number;
  user_email?: string; user_serial?: string;
};
type Method = { id: string; name: string; details: string; qr_image: string; min_amount: number; max_amount: number; is_active: boolean };
type Inv = { id: string; amount: number; status: string; realized_return: number; started_at: string; ends_at: string; user_email?: string; user_serial?: string; package_name?: string };
type TicketRow = { id: string; subject: string; status: string; created_at: string; user_email?: string; user_serial?: string };
type TReply = { id: string; body: string; is_admin: boolean; created_at: string };
type UserRow = {
  id: string; email: string; serial: string; is_frozen: boolean; role: string; stars: number;
  default_withdraw_address: string | null; withdraw_qr_image: string | null; withdraw_fee_pct: number | null;
  wallet: { available: number; pending: number; invested: number } | null;
};
type UserDetail = {
  user: { id: string; email: string; serial: string; full_name: string; role: string;
    is_frozen: boolean; is_active: boolean; email_verified: boolean; stars: number;
    default_withdraw_address: string | null;
    withdraw_qr_image: string | null; withdraw_fee_pct: number | null;
    created_at: string | null };
  inviter: { user_email?: string | null; user_serial?: string | null };
  referred_count: number;
  wallet: { available: number; pending: number; invested: number } | null;
  deposits: { id: string; amount: number; method: string; proof: string; screenshot: string;
    status: string; created_at: string | null }[];
  withdrawals: { id: string; amount: number; fee: number; star_penalty: number;
    net_payout: number; address: string; status: string; txid: string;
    created_at: string | null }[];
  investments: { id: string; amount: number; status: string; realized_return: number;
    package_name: string | null; ends_at: string | null }[];
  ledger: { id: string; kind: string; direction: string; bucket: string;
    amount: number; note: string; created_at: string | null }[];
};

const TABS = ["stats", "packages", "investments", "deposits", "withdrawals", "users", "tickets", "methods", "settings", "audit"] as const;
const EMPTY_PKG = { name: "", description: "", min_deposit: 0, max_deposit: 0, yield_min_pct: 0, yield_max_pct: 0, return_min_amount: 0, return_max_amount: 0, duration_days: 30, is_active: true, sort_order: 0 };
const EMPTY_METHOD = { name: "", details: "", qr_image: "", min_amount: 0, max_amount: 0, is_active: true };
const MONEY_STATS = new Set(["deposits_approved_total", "commissions_total"]);
const apiBase = API_URL.replace("/api", "");
// The console lives on a per-deployment secret path (NEXT_PUBLIC_ADMIN_PATH),
// baked at build time. Any other /nx/* key renders a plain 404.
const ADMIN_PATH = process.env.NEXT_PUBLIC_ADMIN_PATH || "";

export default function Admin() {
  const { t } = useT();
  const { toast } = useToast();
  const params = useParams();
  const keyOk = !!ADMIN_PATH && params?.key === ADMIN_PATH;
  const [gate, setGate] = useState<"checking" | "login" | "ok">("checking");
  const [loginForm, setLoginForm] = useState({ id: "", password: "" });
  const [loginErr, setLoginErr] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>("stats");
  const [denied, setDenied] = useState(false);
  const [stats, setStats] = useState<Stats>({});
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [deposits, setDeposits] = useState<Row[]>([]);
  const [withdrawals, setWithdrawals] = useState<Row[]>([]);
  const [depFilter, setDepFilter] = useState<"pending" | "all">("pending");
  const [wdFilter, setWdFilter] = useState<"pending" | "all">("pending");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userQ, setUserQ] = useState("");
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>({});
  const [audit, setAudit] = useState<{ id: string; action: string; target_type: string; target_id: string; created_at: string; details: object }[]>([]);
  const [pkgForm, setPkgForm] = useState(EMPTY_PKG);
  const [methods, setMethods] = useState<Method[]>([]);
  const [mForm, setMForm] = useState(EMPTY_METHOD);
  const [mQr, setMQr] = useState<File | null>(null);
  const [editingMethod, setEditingMethod] = useState<string | null>(null);
  const [settingsJson, setSettingsJson] = useState<Record<string, string>>({});
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [investments, setInvestments] = useState<Inv[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [openTicket, setOpenTicket] = useState<TicketRow | null>(null);
  const [replies, setReplies] = useState<TReply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selDeps, setSelDeps] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [depPage, setDepPage] = useState(0);
  const [wdPage, setWdPage] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [invPage, setInvPage] = useState(0);
  const [auditPage, setAuditPage] = useState(0);

  const refreshReplies = () => {
    if (!openTicket) return;
    api<{ replies: TReply[] }>(`/tickets/${openTicket.id}`).then((d) => setReplies(d.replies)).catch(() => {});
  };

  const load = () => {
    if (gate !== "ok") return;
    api<Stats>("/admin/stats").then((s) => { setStats(s); setDenied(false); }).catch((e) => {
      const msg = String(e?.message ?? "");
      if (msg.includes("403") || msg.toLowerCase().includes("admin")) { setDenied(true); setGate("login"); }
    });
    api<Pkg[]>("/admin/packages").then(setPackages).catch(() => {});
    // Fetch all (history included) — filter client-side so "approved"
    // withdrawals stay visible until actually paid.
    api<Row[]>("/admin/deposits").then((rows) =>
      setDeposits(depFilter === "pending" ? rows.filter((r) => r.status === "pending") : rows)).catch(() => {});
    api<Row[]>("/admin/withdrawals").then((rows) =>
      setWithdrawals(wdFilter === "pending" ? rows.filter((r) => r.status === "pending" || r.status === "approved") : rows)).catch(() => {});
    api<UserRow[]>(`/admin/users${userQ ? `?q=${encodeURIComponent(userQ)}` : ""}`).then(setUsers).catch(() => {});
    api<typeof settings>("/admin/settings").then((s) => {
      setSettings(s);
      // Never clobber in-progress edits — the 10s poll used to erase what the
      // admin was typing into the JSON textareas.
      if (!settingsDirty) {
        setSettingsJson(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, JSON.stringify(v, null, 2)])));
      }
    }).catch(() => {});
    api<typeof audit>("/admin/audit").then(setAudit).catch(() => {});
    api<Method[]>("/admin/payment-methods").then(setMethods).catch(() => {});
    api<Inv[]>("/admin/investments").then(setInvestments).catch(() => {});
    api<TicketRow[]>("/admin/tickets").then(setTickets).catch(() => {});
  };

  // Gate: secret path ok → check the session is actually an admin
  useEffect(() => {
    if (!keyOk) return;
    api<{ role: string }>("/auth/me")
      .then((u) => setGate(u.role === "admin" ? "ok" : "login"))
      .catch(() => setGate("login"));
  }, [keyOk]);

  useEffect(load, [depFilter, wdFilter, userQ, gate]);
  useEffect(() => {
    if (gate !== "ok") return;
    const id = setInterval(() => { load(); refreshReplies(); }, 10000);
    return () => clearInterval(id);
  }, [depFilter, wdFilter, userQ, openTicket?.id, gate]);

  const adminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginBusy) return;
    setLoginErr("");
    setLoginBusy(true);
    try {
      const tk = await api<{ access_token: string; refresh_token: string }>(
        "/auth/login", { method: "POST", body: JSON.stringify({ identifier: loginForm.id, password: loginForm.password }), auth: false });
      setTokens(tk.access_token, tk.refresh_token);
      const me = await api<{ role: string }>("/auth/me");
      if (me.role !== "admin") {
        clearTokens();
        setLoginErr(t("admin_only"));
        return;
      }
      setGate("ok");
    } catch (err) {
      setLoginErr(err instanceof Error ? err.message : t("login_failed"));
    } finally {
      setLoginBusy(false);
    }
  };

  const act = (path: string, body: object = {}) =>
    api(path, { method: "POST", body: JSON.stringify(body) })
      .then(load)
      .catch((e) => toast(e instanceof Error ? e.message : t("failed"), "err"));

  const [editingPkg, setEditingPkg] = useState<string | null>(null);

  const pendingDeps = stats.deposits_pending ?? 0;
  const pendingWds = stats.withdrawals_actionable ?? stats.withdrawals_pending ?? 0;
  const openTickets = stats.tickets_open ?? 0;

  const savePkg = async () => {
    // 0 return amounts mean "use yield %" — send null, not literal 0
    const body = {
      ...pkgForm,
      return_min_amount: pkgForm.return_min_amount || null,
      return_max_amount: pkgForm.return_max_amount || null,
    };
    try {
      if (editingPkg) {
        await api(`/admin/packages/${editingPkg}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/admin/packages", { method: "POST", body: JSON.stringify(body) });
      }
      setEditingPkg(null);
      setPkgForm(EMPTY_PKG);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : t("failed"), "err"); }
  };

  const editPkg = (p: Pkg) => {
    setEditingPkg(p.id);
    setPkgForm({
      name: p.name, description: p.description ?? "", min_deposit: p.min_deposit, max_deposit: p.max_deposit,
      yield_min_pct: p.yield_min_pct, yield_max_pct: p.yield_max_pct,
      return_min_amount: p.return_min_amount ?? 0, return_max_amount: p.return_max_amount ?? 0,
      duration_days: p.duration_days, is_active: p.is_active, sort_order: p.sort_order ?? 0,
    });
  };

  const saveMethod = async () => {
    try {
      let qr = mForm.qr_image;
      if (mQr) {
        const fd = new FormData();
        fd.append("file", mQr);
        const up = await api<{ path: string }>("/uploads", { method: "POST", body: fd });
        qr = up.path;
      }
      const body = JSON.stringify({ ...mForm, qr_image: qr });
      if (editingMethod) {
        await api(`/admin/payment-methods/${editingMethod}`, { method: "PUT", body });
      } else {
        await api("/admin/payment-methods", { method: "POST", body });
      }
      setMQr(null);
      setMForm(EMPTY_METHOD);
      setEditingMethod(null);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : t("failed"), "err"); }
  };

  const editMethod = (m: Method) => {
    setEditingMethod(m.id);
    setMForm({ name: m.name, details: m.details ?? "", qr_image: m.qr_image ?? "", min_amount: m.min_amount, max_amount: m.max_amount, is_active: m.is_active });
  };

  const openTicketDetail = async (tk: TicketRow) => {
    setOpenTicket(tk);
    const d = await api<{ ticket: TicketRow; replies: TReply[] }>(`/tickets/${tk.id}`).catch(() => null);
    if (d) setReplies(d.replies);
  };

  const sendAdminReply = async () => {
    if (!openTicket || !replyText.trim()) return;
    try {
      await api(`/tickets/${openTicket.id}/reply`, { method: "POST", body: JSON.stringify({ body: replyText }) });
      setReplyText("");
      openTicketDetail(openTicket);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : t("failed"), "err"); }
  };

  const settleInv = (inv: Inv) => {
    const amt = prompt(t("settle_prompt").replace("{pkg}", inv.package_name ?? ""));
    if (!amt?.trim() || isNaN(+amt) || +amt < 0) return;
    act(`/admin/investments/${inv.id}/settle`, { return_amount: +amt });
  };

  const KNOWN_SETTINGS = ["platform", "deposit", "withdrawal", "referral", "faq", "legal"];

  const updSetting = (key: string, patch: Record<string, unknown>) => {
    setSettingsDirty(true);
    setSettings((s) => ({ ...s, [key]: { ...(s[key] ?? {}), ...patch } }));
  };

  const saveSetting = (key: string) => {
    let value: unknown = settings[key];
    if (!KNOWN_SETTINGS.includes(key) && key in settingsJson) { // raw-JSON fallback keys
      try { value = JSON.parse(settingsJson[key]); } catch { toast(t("invalid_json"), "err"); return; }
    }
    api(`/admin/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) })
      .then(() => { setSettingsDirty(false); toast(t("saved")); load(); })
      .catch((e) => toast(e instanceof Error ? e.message : t("failed"), "err"));
  };

  const processWithdrawal = (w: Row, action: string) => {
    let txid = "";
    if (action === "paid") {
      const v = prompt(t("txid_ph"));
      if (v === null || !v.trim()) return; // txid required to mark paid
      txid = v.trim();
    }
    act(`/admin/withdrawals/${w.id}/process`, { action, txid, note: "" });
  };

  const openUser = (id: string) => {
    setDetailLoading(true);
    api<UserDetail>(`/admin/users/${id}/detail`)
      .then(setDetail)
      .catch((e) => toast(e instanceof Error ? e.message : t("failed"), "err"))
      .finally(() => setDetailLoading(false));
  };

  const bulkDeposits = async (action: "approve" | "reject") => {
    if (!selDeps.size || bulkBusy) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const id of selDeps) {
      try { await api(`/admin/deposits/${id}/${action}`, { method: "POST" }); ok++; }
      catch { fail++; }
    }
    setSelDeps(new Set());
    setBulkBusy(false);
    if (fail) toast(`${ok} ✓ / ${fail} ✗`, "err");
    load();
  };

  const pendingDepositIds = deposits.filter((d) => d.status === "pending").map((d) => d.id);

  // Wrong secret path → indistinguishable from a missing page
  if (!keyOk) {
    return (
      <main className="grid min-h-[60vh] place-items-center px-4">
        <div className="text-center">
          <p className="font-display text-4xl">404</p>
          <p className="mt-2 text-sm text-muted">{t("not_found")}</p>
        </div>
      </main>
    );
  }

  if (gate === "checking") {
    return (
      <main><Nav />
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-10">
          <div className="skeleton h-8 w-40" />
          <div className="skeleton h-64 w-full" />
        </div>
      </main>
    );
  }

  // Hidden-console login: admin ID + password. No email, no signup links.
  if (gate === "login") {
    return (
      <main className="grid min-h-[80vh] place-items-center px-4">
        <GlassCard className="w-full max-w-sm">
          <form onSubmit={adminLogin} className="space-y-3">
            <input className="input font-mono" placeholder="ID" required autoComplete="off"
              value={loginForm.id} onChange={(e) => setLoginForm({ ...loginForm, id: e.target.value })} />
            <input className="input" type="password" placeholder={t("password")} required autoComplete="current-password"
              value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
            {loginErr && <p className="text-xs text-red-400">{loginErr}</p>}
            <button className="btn w-full disabled:opacity-50" type="submit" disabled={loginBusy}>{t("login")}</button>
          </form>
          {process.env.NODE_ENV === "development" && (
            <button type="button" className="btn-ghost mt-3 w-full text-xs"
              onClick={() => setLoginForm({ id: "nx-admin-dev", password: "Admin123!x" })}>
              demo autofill
            </button>
          )}
        </GlassCard>
      </main>
    );
  }

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("admin")} />
        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((tb) => {
            const badge = tb === "deposits" ? pendingDeps
              : tb === "withdrawals" ? pendingWds
              : tb === "tickets" ? openTickets : 0;
            return (
              <button key={tb} onClick={() => setTab(tb)}
                className={`relative rounded-full px-4 py-1.5 text-xs capitalize transition ${tab === tb ? "bg-white/10" : "text-muted hover:text-white"}`}>
                {t(tb)}
                {badge > 0 && (
                  <span className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-black">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "stats" && (
          <div className="space-y-4">
          {(pendingDeps + pendingWds + openTickets) > 0 && (
            <GlassCard className="gold-edge">
              <p className="mb-3 font-display text-sm">{t("needs_action")}</p>
              <div className="flex flex-wrap gap-2">
                {pendingDeps > 0 && (
                  <button onClick={() => setTab("deposits")} className="btn-ghost px-4 py-2 text-xs">
                    {pendingDeps} {t("deposits")}
                  </button>
                )}
                {pendingWds > 0 && (
                  <button onClick={() => setTab("withdrawals")} className="btn-ghost px-4 py-2 text-xs">
                    {pendingWds} {t("withdrawals")}
                  </button>
                )}
                {openTickets > 0 && (
                  <button onClick={() => setTab("tickets")} className="btn-ghost px-4 py-2 text-xs">
                    {openTickets} {t("tickets")}
                  </button>
                )}
              </div>
            </GlassCard>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {Object.entries(stats).filter(([k]) => !["withdrawals_actionable", "tickets_open"].includes(k)).map(([k, v]) => (
              <GlassCard key={k} className="glow-card"><p className="text-xs text-muted">{t(`stat_${k}`)}</p>
                <p className="mt-2 text-2xl font-semibold">
                  <CountUp value={Number(v)} decimals={MONEY_STATS.has(k) ? 2 : 0}
                    prefix={MONEY_STATS.has(k) ? "$" : ""} />
                </p></GlassCard>
            ))}
          </div>
          </div>
        )}

        {tab === "packages" && (
          <div className="space-y-4">
            <GlassCard>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-medium">{editingPkg ? t("edit_package") : t("new_package")}</h2>
                {editingPkg && (
                  <button className="btn-ghost px-3 py-1 text-xs" onClick={() => {
                    setEditingPkg(null); setPkgForm(EMPTY_PKG);
                  }}>{t("cancel")}</button>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <input className="input" placeholder={t("name")} value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} />
                <input className="input" type="number" placeholder={t("min_deposit")} value={pkgForm.min_deposit || ""} onChange={(e) => setPkgForm({ ...pkgForm, min_deposit: +e.target.value })} />
                <input className="input" type="number" placeholder={t("max_deposit")} value={pkgForm.max_deposit || ""} onChange={(e) => setPkgForm({ ...pkgForm, max_deposit: +e.target.value })} />
                <input className="input" type="number" placeholder={t("yield_min")} value={pkgForm.yield_min_pct || ""} onChange={(e) => setPkgForm({ ...pkgForm, yield_min_pct: +e.target.value })} />
                <input className="input" type="number" placeholder={t("yield_max")} value={pkgForm.yield_max_pct || ""} onChange={(e) => setPkgForm({ ...pkgForm, yield_max_pct: +e.target.value })} />
                <input className="input" type="number" placeholder={t("est_return_min")} value={pkgForm.return_min_amount || ""} onChange={(e) => setPkgForm({ ...pkgForm, return_min_amount: +e.target.value })} />
                <input className="input" type="number" placeholder={t("est_return_max")} value={pkgForm.return_max_amount || ""} onChange={(e) => setPkgForm({ ...pkgForm, return_max_amount: +e.target.value })} />
                <input className="input" type="number" placeholder={t("duration_days_ph")} value={pkgForm.duration_days || ""} onChange={(e) => setPkgForm({ ...pkgForm, duration_days: +e.target.value })} />
                <input className="input" type="number" placeholder={t("sort_order")} value={pkgForm.sort_order || ""} onChange={(e) => setPkgForm({ ...pkgForm, sort_order: +e.target.value })} />
              </div>
              <input className="input mt-2" placeholder={t("description")} value={pkgForm.description}
                onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })} />
              <label className="mt-3 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={pkgForm.is_active}
                  onChange={(e) => setPkgForm({ ...pkgForm, is_active: e.target.checked })} />
                {t("is_active")}
              </label>
              <button className="btn mt-4" onClick={savePkg}>{editingPkg ? t("save_changes") : t("create")}</button>
            </GlassCard>
            <GlassCard>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted">
                  <th className="pb-2">{t("name")}</th><th className="pb-2">{t("price")}</th><th className="pb-2">{t("daily")}</th><th className="pb-2">{t("days")}</th><th className="pb-2">{t("active")}</th><th className="pb-2"></th>
                </tr></thead>
                <tbody>{packages.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2">${Number(p.min_deposit).toLocaleString()}</td>
                    <td className="py-2">{p.return_min_amount != null ? `$${p.return_min_amount}–$${p.return_max_amount}` : `${p.yield_min_pct}–${p.yield_max_pct}%`}</td>
                    <td className="py-2">{p.duration_days}</td>
                    <td className="py-2">{p.is_active ? t("yes") : t("no")}</td>
                    <td className="flex gap-2 py-2">
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => editPkg(p)}>{t("edit")}</button>
                      <button className="btn-ghost px-3 py-1 text-xs"
                        onClick={() => { if (confirm(t("delete") + "?")) api(`/admin/packages/${p.id}`, { method: "DELETE" }).then(load).catch((e) => toast(e instanceof Error ? e.message : t("failed"), "err")); }}>
                        {t("delete")}
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </GlassCard>
          </div>
        )}

        {tab === "investments" && (
          <GlassCard>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted">
                <th className="pb-2">{t("user")}</th><th className="pb-2">{t("package")}</th>
                <th className="pb-2">{t("amount")}</th><th className="pb-2">{t("realized_return")}</th>
                <th className="pb-2">{t("ends")}</th><th className="pb-2">{t("status")}</th><th className="pb-2"></th>
              </tr></thead>
              <tbody>{investments.slice(invPage * PAGE_SIZE, invPage * PAGE_SIZE + PAGE_SIZE).map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="py-2">
                    <p className="text-xs">{i.user_email}</p>
                    <p className="font-mono text-[10px] text-accent">{i.user_serial}</p>
                  </td>
                  <td className="py-2">{i.package_name}</td>
                  <td className="py-2">${Number(i.amount).toLocaleString()}</td>
                  <td className="py-2">${Number(i.realized_return).toLocaleString()}</td>
                  <td className="py-2 text-xs text-muted">{new Date(i.ends_at).toLocaleDateString()}</td>
                  <td className="py-2 capitalize">{t(i.status)}</td>
                  <td className="py-2">
                    {i.status === "active" && (
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => settleInv(i)}>
                        {t("settle")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
            <Pager total={investments.length} page={invPage} setPage={setInvPage} />
          </GlassCard>
        )}

        {tab === "tickets" && (
          <div className="grid gap-4 md:grid-cols-2">
            <GlassCard>
              <div className="space-y-2">
                {tickets.length === 0 && <p className="text-xs text-muted">{t("no_tickets")}</p>}
                {tickets.map((tk) => (
                  <button key={tk.id} onClick={() => openTicketDetail(tk)}
                    className={`block w-full rounded-xl border px-4 py-3 text-start transition ${openTicket?.id === tk.id ? "border-accent" : "border-border hover:border-white/15"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm">{tk.subject}</span>
                      <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] capitalize text-muted">{t(tk.status)}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted">{tk.user_email} · {tk.user_serial}</p>
                  </button>
                ))}
              </div>
            </GlassCard>
            <GlassCard className="flex min-h-96 flex-col">
              {!openTicket ? (
                <p className="py-16 text-center text-sm text-muted">{t("select_ticket")}</p>
              ) : (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <h2 className="font-medium">{openTicket.subject}</h2>
                    {openTicket.status !== "closed" && (
                      <button className="btn-ghost shrink-0 px-3 py-1 text-xs"
                        onClick={() => act(`/admin/tickets/${openTicket.id}/close`).then(() => setOpenTicket({ ...openTicket, status: "closed" }))}>
                        {t("close_ticket")}
                      </button>
                    )}
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto pb-4">
                    {replies.map((r) => (
                      <div key={r.id} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${r.is_admin ? "ml-auto bg-accent/15 border border-accent/25" : "bg-white/10"}`}>
                        <p className="leading-relaxed">{r.body}</p>
                        <p className="mt-1 text-[9px] text-muted">{new Date(r.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                  {openTicket.status !== "closed" && (
                    <div className="flex gap-2 border-t border-border pt-4">
                      <input className="input" placeholder={t("write_reply")} value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendAdminReply()} />
                      <button className="btn shrink-0 px-4" onClick={sendAdminReply}>{t("send")}</button>
                    </div>
                  )}
                </>
              )}
            </GlassCard>
          </div>
        )}

        {tab === "deposits" && (
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(["pending", "all"] as const).map((f) => (
                <button key={f} onClick={() => { setDepFilter(f); setDepPage(0); setSelDeps(new Set()); }}
                  className={`rounded-full px-3 py-1 text-xs transition ${depFilter === f ? "bg-white/10" : "text-muted hover:text-white"}`}>
                  {f === "pending" ? t("pending_only") : t("all")}
                </button>
              ))}
              {selDeps.size > 0 && (
                <div className="ms-auto flex items-center gap-2">
                  <span className="text-xs text-muted">{selDeps.size} {t("selected")}</span>
                  <button disabled={bulkBusy} onClick={() => bulkDeposits("approve")}
                    className="btn px-3 py-1 text-xs disabled:opacity-40">{t("approve_selected")}</button>
                  <button disabled={bulkBusy} onClick={() => bulkDeposits("reject")}
                    className="btn-ghost px-3 py-1 text-xs text-red-300 disabled:opacity-40">{t("reject_selected")}</button>
                </div>
              )}
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted">
                <th className="w-8 pb-2">
                  <input type="checkbox"
                    checked={pendingDepositIds.length > 0 && pendingDepositIds.every((id) => selDeps.has(id))}
                    onChange={(e) => setSelDeps(e.target.checked ? new Set(pendingDepositIds) : new Set())} />
                </th>
                <th className="pb-2">{t("user")}</th><th className="pb-2">{t("amount")}</th><th className="pb-2">{t("method")}</th><th className="pb-2">{t("status")}</th><th className="pb-2">{t("proof")}</th><th className="pb-2">{t("actions")}</th>
              </tr></thead>
              <tbody>{deposits.slice(depPage * PAGE_SIZE, depPage * PAGE_SIZE + PAGE_SIZE).map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="py-2">
                    {d.status === "pending" && (
                      <input type="checkbox" checked={selDeps.has(d.id)}
                        onChange={(e) => {
                          const s = new Set(selDeps);
                          e.target.checked ? s.add(d.id) : s.delete(d.id);
                          setSelDeps(s);
                        }} />
                    )}
                  </td>
                  <td className="py-2">
                    <p className="text-xs">{d.user_email}</p>
                    <p className="font-mono text-[10px] text-accent">{d.user_serial}</p>
                  </td>
                  <td className="py-2">${Number(d.amount).toLocaleString()}</td>
                  <td className="py-2 text-xs">{d.method}</td>
                  <td className="py-2 capitalize">{t(d.status)}</td>
                  <td className="py-2 text-xs">
                    {d.proof && <p className="mb-1 font-mono text-[10px] text-muted">{d.proof}</p>}
                    {d.screenshot && (
                      <button onClick={() => setPreview(`${apiBase}${d.screenshot}`)}
                        className="block" title={t("view")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${apiBase}${d.screenshot}`} alt={t("screenshot")}
                          className="h-12 w-auto rounded-lg border border-border transition hover:border-accent" />
                      </button>
                    )}
                  </td>
                  <td className="flex gap-2 py-2">
                    {d.status === "pending" && (
                      <>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => act(`/admin/deposits/${d.id}/approve`)}>{t("approve")}</button>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => act(`/admin/deposits/${d.id}/reject`)}>{t("reject")}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
            <Pager total={deposits.length} page={depPage} setPage={setDepPage} />
          </GlassCard>
        )}

        {tab === "withdrawals" && (
          <GlassCard>
            <div className="mb-4 flex gap-2">
              {(["pending", "all"] as const).map((f) => (
                <button key={f} onClick={() => { setWdFilter(f); setWdPage(0); }}
                  className={`rounded-full px-3 py-1 text-xs transition ${wdFilter === f ? "bg-white/10" : "text-muted hover:text-white"}`}>
                  {f === "pending" ? t("pending_only") : t("all")}
                </button>
              ))}
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted">
                <th className="pb-2">{t("user")}</th><th className="pb-2">{t("amount")}</th><th className="pb-2">{t("address")}</th><th className="pb-2">{t("status")}</th><th className="pb-2">{t("actions")}</th>
              </tr></thead>
              <tbody>{withdrawals.slice(wdPage * PAGE_SIZE, wdPage * PAGE_SIZE + PAGE_SIZE).map((w) => (
                <tr key={w.id} className="border-t border-border">
                  <td className="py-2">
                    <p className="text-xs">{w.user_email}</p>
                    <p className="font-mono text-[10px] text-accent">{w.user_serial}</p>
                  </td>
                  <td className="py-2">
                    <p>${Number(w.amount).toLocaleString()}</p>
                    {w.fee != null && <p className="text-[10px] text-muted">+${Number(w.fee).toLocaleString()} {t("fee")}</p>}
                    {(w.star_penalty ?? 0) > 0 && (
                      <p className="text-[10px] text-red-300">−${Number(w.star_penalty).toLocaleString()} {t("star_penalty")}</p>
                    )}
                    {w.net_payout != null && w.net_payout !== w.amount && (
                      <p className="mt-0.5 text-[10px] font-semibold text-accent">{t("net_payout")}: ${Number(w.net_payout).toLocaleString()}</p>
                    )}
                  </td>
                  <td className="max-w-44 py-2">
                    <p className="break-all font-mono text-[10px] text-muted">{w.address}</p>
                    {w.txid && <p className="mt-1 break-all font-mono text-[10px] text-accent">{t("txid")}: {w.txid}</p>}
                  </td>
                  <td className="py-2 capitalize">{t(w.status)}</td>
                  <td className="flex gap-2 py-2">
                    {w.status === "pending" && (
                      <>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => processWithdrawal(w, "approve")}>{t("approve")}</button>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => processWithdrawal(w, "paid")}>{t("paid")}</button>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => processWithdrawal(w, "reject")}>{t("reject")}</button>
                      </>
                    )}
                    {w.status === "approved" && (
                      <>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => processWithdrawal(w, "paid")}>{t("paid")}</button>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => processWithdrawal(w, "reject")}>{t("reject")}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
            <Pager total={withdrawals.length} page={wdPage} setPage={setWdPage} />
          </GlassCard>
        )}

        {tab === "users" && (
          <GlassCard>
            <input className="input mb-4 max-w-xs" placeholder={t("search_users")}
              value={userQ} onChange={(e) => { setUserQ(e.target.value); setUserPage(0); }} />
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted">
                <th className="pb-2">{t("serial_col")}</th><th className="pb-2">{t("email_col")}</th><th className="pb-2">{t("stars")}</th><th className="pb-2">{t("wallet")}</th>
                <th className="pb-2">{t("address")}</th><th className="pb-2">{t("role")}</th><th className="pb-2">{t("frozen")}</th><th className="pb-2"></th>
              </tr></thead>
              <tbody>{users.slice(userPage * PAGE_SIZE, userPage * PAGE_SIZE + PAGE_SIZE).map((u) => (
                <tr key={u.id} className="cursor-pointer border-t border-border transition hover:bg-white/[0.03]"
                  onClick={() => openUser(u.id)}>
                  <td className="py-2 font-mono text-xs text-accent">{u.serial || "—"}</td>
                  <td className="py-2">{u.email}</td>
                  <td className="py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <Stars value={u.stars ?? 4} size={12} />
                      <button className="grid h-5 w-5 place-items-center rounded-full border border-border text-[10px] text-muted transition hover:border-red-400/60 hover:text-red-300"
                        title={t("deduct_star")}
                        onClick={() => {
                          if (u.stars <= 0) return;
                          const reason = prompt(t("deduct_reason")) ?? "";
                          act(`/admin/users/${u.id}/stars`, { stars: u.stars - 1, reason });
                        }}>−</button>
                      <button className="grid h-5 w-5 place-items-center rounded-full border border-border text-[10px] text-muted transition hover:border-accent/60 hover:text-accent"
                        title={t("restore_star")}
                        onClick={() => {
                          if (u.stars >= 4) return;
                          act(`/admin/users/${u.id}/stars`, { stars: u.stars + 1, reason: "" });
                        }}>+</button>
                    </div>
                  </td>
                  <td className="py-2 text-xs text-muted">
                    {u.wallet ? `$${Number(u.wallet.available).toLocaleString()} ${t("avail_inv_fmt")} · $${Number(u.wallet.invested).toLocaleString()} ${t("inv_short")}` : "—"}
                  </td>
                  <td className="max-w-40 py-2" onClick={(e) => e.stopPropagation()}>
                    {u.default_withdraw_address ? (
                      <>
                        <p className="truncate font-mono text-[10px] text-muted">{u.default_withdraw_address}</p>
                        {u.withdraw_qr_image && (
                          <a href={`${apiBase}${u.withdraw_qr_image}`} target="_blank" className="text-[10px] text-accent underline">QR</a>
                        )}
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="py-2">
                    <p>{u.role}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {t("custom_fee")}: {u.withdraw_fee_pct != null ? `${u.withdraw_fee_pct}%` : "—"}
                    </p>
                  </td>
                  <td className="py-2">{u.is_frozen ? t("yes") : t("no")}</td>
                  <td className="flex flex-wrap gap-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => act(`/admin/users/${u.id}/freeze`)}>
                      {u.is_frozen ? t("unfreeze") : t("freeze")}
                    </button>
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => {
                      const amt = prompt(t("adjust_prompt").replace("{email}", u.email));
                      if (!amt || isNaN(+amt)) return;
                      const note = prompt(t("adjust_reason")) ?? "";
                      act(`/admin/users/${u.id}/adjust`, { amount: +amt, bucket: "available", note });
                    }}>{t("adjust")}</button>
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => {
                      const v = prompt(t("set_fee_prompt").replace("{email}", u.email));
                      if (v === null) return;
                      if (v.trim() !== "" && (isNaN(+v) || +v < 0 || +v > 100)) return;
                      act(`/admin/users/${u.id}/fee`, { fee_pct: v.trim() === "" ? null : +v });
                    }}>{t("fee")}</button>
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={() => {
                      const v = prompt(t("change_addr_prompt").replace("{email}", u.email));
                      if (!v || v.length < 8) return;
                      act(`/admin/users/${u.id}/withdraw-address`, { address: v });
                    }}>{t("address")}</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
            <Pager total={users.length} page={userPage} setPage={setUserPage} />
          </GlassCard>
        )}

        {tab === "methods" && (
          <div className="space-y-4">
            <GlassCard>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-medium">{editingMethod ? t("edit") : t("new_method")}</h2>
                {editingMethod && (
                  <button className="btn-ghost px-3 py-1 text-xs" onClick={() => { setEditingMethod(null); setMForm(EMPTY_METHOD); setMQr(null); }}>{t("cancel")}</button>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <input className="input" placeholder={t("method_name_ph")} value={mForm.name}
                  onChange={(e) => setMForm({ ...mForm, name: e.target.value })} />
                <input className="input" placeholder={t("method_details_ph")} value={mForm.details}
                  onChange={(e) => setMForm({ ...mForm, details: e.target.value })} />
                <input className="input" type="number" placeholder={t("min_deposit")} value={mForm.min_amount || ""}
                  onChange={(e) => setMForm({ ...mForm, min_amount: +e.target.value })} />
                <input className="input" type="number" placeholder={t("max_deposit")} value={mForm.max_amount || ""}
                  onChange={(e) => setMForm({ ...mForm, max_amount: +e.target.value })} />
              </div>
              <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border px-4 py-5 text-xs text-muted transition hover:border-accent">
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => setMQr(e.target.files?.[0] ?? null)} />
                {mQr ? `${t("qr_selected")} ${mQr.name}` : t("upload_qr")}
              </label>
              <label className="mt-3 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={mForm.is_active}
                  onChange={(e) => setMForm({ ...mForm, is_active: e.target.checked })} />
                {t("is_active")}
              </label>
              <button className="btn mt-4" onClick={saveMethod}>{editingMethod ? t("save_changes") : t("create")}</button>
            </GlassCard>
            <GlassCard>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted">
                  <th className="pb-2">{t("name")}</th><th className="pb-2">QR</th><th className="pb-2">{t("status")}</th><th className="pb-2"></th>
                </tr></thead>
                <tbody>{methods.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-2">{m.name}</td>
                    <td className="py-2">
                      {m.qr_image ? (
                        <a href={`${apiBase}${m.qr_image}`} target="_blank" className="text-accent underline">QR</a>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-2 text-muted">{m.is_active ? t("active") : t("disabled")}</td>
                    <td className="py-2">
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => editMethod(m)}>{t("edit")}</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </GlassCard>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-4">
            <GlassCard>
              <p className="mb-3 text-sm font-medium">{t("platform")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-muted">{t("platform_name")}</label>
                  <input className="input" value={String(settings.platform?.name ?? "")}
                    onChange={(e) => updSetting("platform", { name: e.target.value })} />
                </div>
                <label className="flex items-end gap-2 pb-1.5 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]"
                    checked={Boolean(settings.platform?.maintenance_mode)}
                    onChange={(e) => updSetting("platform", { maintenance_mode: e.target.checked })} />
                  {t("maintenance_mode")}
                </label>
              </div>
              <button className="btn-ghost mt-3 text-xs" onClick={() => saveSetting("platform")}>{t("save")}</button>
            </GlassCard>

            <div className="grid gap-4 md:grid-cols-2">
              <GlassCard>
                <p className="mb-3 text-sm font-medium">{t("deposit_limits")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted">{t("min_amount")} ($)</label>
                    <input className="input" type="number" value={Number(settings.deposit?.min ?? 0)}
                      onChange={(e) => updSetting("deposit", { min: +e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">{t("max_amount")} ($)</label>
                    <input className="input" type="number" value={Number(settings.deposit?.max ?? 0)}
                      onChange={(e) => updSetting("deposit", { max: +e.target.value })} />
                  </div>
                </div>
                <button className="btn-ghost mt-3 text-xs" onClick={() => saveSetting("deposit")}>{t("save")}</button>
              </GlassCard>

              <GlassCard>
                <p className="mb-3 text-sm font-medium">{t("withdrawal_rules")}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted">{t("min_amount")} ($)</label>
                    <input className="input" type="number" value={Number(settings.withdrawal?.min ?? 0)}
                      onChange={(e) => updSetting("withdrawal", { min: +e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">{t("max_amount")} ($)</label>
                    <input className="input" type="number" value={Number(settings.withdrawal?.max ?? 0)}
                      onChange={(e) => updSetting("withdrawal", { max: +e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">{t("fee_pct")}</label>
                    <input className="input" type="number" value={Number(settings.withdrawal?.fee_pct ?? 0)}
                      onChange={(e) => updSetting("withdrawal", { fee_pct: +e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">{t("fee_flat")}</label>
                    <input className="input" type="number" value={Number(settings.withdrawal?.fee_flat ?? 0)}
                      onChange={(e) => updSetting("withdrawal", { fee_flat: +e.target.value })} />
                  </div>
                </div>
                <button className="btn-ghost mt-3 text-xs" onClick={() => saveSetting("withdrawal")}>{t("save")}</button>
              </GlassCard>
            </div>

            <GlassCard>
              <p className="mb-3 text-sm font-medium">{t("inv_prize")}</p>
              <div className="max-w-xs">
                <label className="mb-1 block text-xs text-muted">{t("prize_pct")}</label>
                <input className="input" type="number" value={Number(settings.referral?.l1_pct ?? 0)}
                  onChange={(e) => updSetting("referral", { l1_pct: +e.target.value })} />
              </div>
              <button className="btn-ghost mt-3 text-xs" onClick={() => saveSetting("referral")}>{t("save")}</button>
            </GlassCard>

            <GlassCard>
              <p className="mb-3 text-sm font-medium">{t("faq_items")}</p>
              <div className="space-y-3">
                {((settings.faq?.items as { q: string; a: string }[] | undefined) ?? []).map((item, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-muted">{t("question")} {i + 1}</label>
                      <button className="text-xs text-red-400 hover:underline"
                        onClick={() => updSetting("faq", { items: (settings.faq?.items as { q: string; a: string }[]).filter((_, j) => j !== i) })}>
                        {t("remove")}
                      </button>
                    </div>
                    <input className="input mt-1" value={item.q}
                      onChange={(e) => updSetting("faq", { items: (settings.faq?.items as { q: string; a: string }[]).map((x, j) => j === i ? { ...x, q: e.target.value } : x) })} />
                    <label className="mt-2 block text-xs text-muted">{t("answer")}</label>
                    <textarea className="input mt-1 min-h-16" value={item.a}
                      onChange={(e) => updSetting("faq", { items: (settings.faq?.items as { q: string; a: string }[]).map((x, j) => j === i ? { ...x, a: e.target.value } : x) })} />
                  </div>
                ))}
                <button className="btn-ghost text-xs"
                  onClick={() => updSetting("faq", { items: [...((settings.faq?.items as { q: string; a: string }[] | undefined) ?? []), { q: "", a: "" }] })}>
                  {t("add_item")}
                </button>
              </div>
              <button className="btn-ghost mt-3 text-xs" onClick={() => saveSetting("faq")}>{t("save")}</button>
            </GlassCard>

            <GlassCard>
              <p className="mb-3 text-sm font-medium">{t("legal_texts")}</p>
              <label className="mb-1 block text-xs text-muted">{t("terms_text")}</label>
              <textarea className="input min-h-28" value={String(settings.legal?.terms ?? "")}
                onChange={(e) => updSetting("legal", { terms: e.target.value })} />
              <label className="mb-1 mt-3 block text-xs text-muted">{t("privacy_text")}</label>
              <textarea className="input min-h-36" value={String(settings.legal?.privacy ?? "")}
                onChange={(e) => updSetting("legal", { privacy: e.target.value })} />
              <button className="btn-ghost mt-3 text-xs" onClick={() => saveSetting("legal")}>{t("save")}</button>
            </GlassCard>

            {Object.keys(settingsJson).filter((k) => !KNOWN_SETTINGS.includes(k) && k !== "wheel").map((key) => (
              <GlassCard key={key}>
                <p className="mb-2 text-sm font-medium capitalize">{key}</p>
                <textarea className="input min-h-24 font-mono text-xs" value={settingsJson[key]}
                  onChange={(e) => { setSettingsDirty(true); setSettingsJson({ ...settingsJson, [key]: e.target.value }); }} />
                <button className="btn-ghost mt-2 text-xs" onClick={() => saveSetting(key)}>{t("save")}</button>
              </GlassCard>
            ))}
          </div>
        )}

        {tab === "audit" && (
          <GlassCard>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted">
                <th className="pb-2">{t("actions")}</th><th className="pb-2">{t("type")}</th><th className="pb-2">{t("date")}</th>
              </tr></thead>
              <tbody>{audit.slice(auditPage * PAGE_SIZE, auditPage * PAGE_SIZE + PAGE_SIZE).map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-2">{a.action}
                    {Object.keys(a.details ?? {}).length > 0 && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted">{JSON.stringify(a.details)}</p>
                    )}
                  </td>
                  <td className="py-2 text-muted">{a.target_type} {a.target_id?.slice(0, 8)}</td>
                  <td className="py-2 text-muted">{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
            <Pager total={audit.length} page={auditPage} setPage={setAuditPage} />
          </GlassCard>
        )}

        {/* ---------- image lightbox ---------- */}
        {preview && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6 backdrop-blur-sm"
            onClick={() => setPreview(null)}>
            <button className="absolute end-5 top-5 btn-ghost px-3 py-1.5 text-xs">{t("close")}</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={t("screenshot")}
              className="max-h-[85vh] max-w-full rounded-2xl border border-border object-contain" />
          </div>
        )}

        {/* ---------- user detail modal ---------- */}
        {(detail || detailLoading) && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setDetail(null)}>
            <div className="mx-auto my-8 w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
              <GlassCard className="relative">
                <button onClick={() => setDetail(null)}
                  className="btn-ghost absolute end-4 top-4 px-3 py-1 text-xs">{t("close")}</button>
                {detailLoading || !detail ? (
                  <div className="space-y-3 py-8">
                    <div className="skeleton h-6 w-48" />
                    <div className="skeleton h-20 w-full" />
                    <div className="skeleton h-32 w-full" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="font-display text-xl">{detail.user.email}</h2>
                        <span className="font-mono text-xs text-accent">{detail.user.serial}</span>
                        <Stars value={detail.user.stars} size={14} />
                        {detail.user.is_frozen && (
                          <span className="rounded-full bg-red-400/15 px-2.5 py-0.5 text-[10px] text-red-300">{t("frozen")}</span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                        {detail.user.full_name && <span>{detail.user.full_name}</span>}
                        <span>{t("joined")}: {detail.user.created_at ? new Date(detail.user.created_at).toLocaleDateString() : "—"}</span>
                        <span>{t("verified")}: {detail.user.email_verified ? t("yes") : t("no")}</span>
                        <span>{t("custom_fee")}: {detail.user.withdraw_fee_pct != null ? `${detail.user.withdraw_fee_pct}%` : "—"}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                        <span>{t("invited_by")}: {detail.inviter.user_email ?? "—"}</span>
                        <span>{t("invited_count")}: {detail.referred_count}</span>
                      </div>
                    </div>

                    {detail.wallet && (
                      <div className="grid grid-cols-3 gap-3">
                        {[["available", detail.wallet.available], ["pending", detail.wallet.pending], ["invested", detail.wallet.invested]].map(([k, v]) => (
                          <div key={k as string} className="rounded-xl border border-border bg-white/[0.03] p-3 text-center">
                            <p className="text-[10px] uppercase tracking-wide text-muted">{t(k as string)}</p>
                            <p className="mt-1 font-display text-lg">${Number(v).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {detail.user.default_withdraw_address && (
                      <p className="break-all font-mono text-[11px] text-muted">
                        {t("address")}: {detail.user.default_withdraw_address}
                      </p>
                    )}

                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("deposits")} ({detail.deposits.length})</p>
                      <div className="max-h-40 space-y-1.5 overflow-y-auto">
                        {detail.deposits.map((d) => (
                          <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                            <span>${Number(d.amount).toLocaleString()} · {d.method}</span>
                            <span className="flex items-center gap-2">
                              {d.screenshot && (
                                <button onClick={() => setPreview(`${apiBase}${d.screenshot}`)} className="text-accent underline">{t("view")}</button>
                              )}
                              <span className="capitalize text-muted">{t(d.status)}</span>
                            </span>
                          </div>
                        ))}
                        {detail.deposits.length === 0 && <p className="text-xs text-muted">—</p>}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("withdrawals")} ({detail.withdrawals.length})</p>
                      <div className="max-h-40 space-y-1.5 overflow-y-auto">
                        {detail.withdrawals.map((w) => (
                          <div key={w.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                            <span>${Number(w.amount).toLocaleString()}
                              {(w.star_penalty ?? 0) > 0 && <span className="text-red-300"> (−${Number(w.star_penalty).toLocaleString()})</span>}
                            </span>
                            <span className="capitalize text-muted">{t(w.status)}{w.txid ? " · " + w.txid.slice(0, 10) : ""}</span>
                          </div>
                        ))}
                        {detail.withdrawals.length === 0 && <p className="text-xs text-muted">—</p>}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("investments")} ({detail.investments.length})</p>
                      <div className="max-h-40 space-y-1.5 overflow-y-auto">
                        {detail.investments.map((i) => (
                          <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs">
                            <span>{i.package_name ?? "—"} · ${Number(i.amount).toLocaleString()}</span>
                            <span className="capitalize text-muted">
                              {t(i.status)}{i.realized_return ? ` +$${Number(i.realized_return).toLocaleString()}` : ""}
                            </span>
                          </div>
                        ))}
                        {detail.investments.length === 0 && <p className="text-xs text-muted">—</p>}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("activity")} ({detail.ledger.length})</p>
                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {detail.ledger.map((e) => (
                          <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-1.5 text-[11px]">
                            <span className="text-muted">
                              <span className={e.direction === "credit" ? "text-emerald-300" : "text-red-300"}>
                                {e.direction === "credit" ? "+" : "−"}${Number(e.amount).toLocaleString()}
                              </span>
                              {" "}{e.kind} · {e.bucket}
                            </span>
                            <span className="shrink-0 text-muted">{e.created_at ? new Date(e.created_at).toLocaleDateString() : ""}</span>
                          </div>
                        ))}
                        {detail.ledger.length === 0 && <p className="text-xs text-muted">—</p>}
                      </div>
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
