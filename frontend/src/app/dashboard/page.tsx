"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { CountUp } from "@/components/CountUp";
import { GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Stars } from "@/components/Stars";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

type Wallet = { available: number; pending: number; invested: number };
type Tx = { id: string; kind: string; direction: string; amount: number; created_at: string };
type Inv = { id: string; package_name: string; amount: number; status: string };

export default function Dashboard() {
  const { t } = useT();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [me, setMe] = useState<{ serial: string; stars: number; full_name: string; email: string } | null>(null);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showAllTx, setShowAllTx] = useState(false);

  useEffect(() => {
    api<Wallet>("/wallet").then(setWallet).catch(() => {});
    api<Tx[]>("/wallet/transactions").then(setTxs).catch(() => {});
    api<Inv[]>("/investments").then(setInvs).catch(() => {});
    api<{ serial: string; stars: number; full_name: string; email: string }>("/auth/me")
      .then(setMe).catch(() => {});
  }, []);

  const displayName = me?.full_name?.trim() || me?.email || "";
  const initials = (me?.full_name?.trim() || me?.email || "·")
    .split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  // Active packages ride beside the member's name — biggest first.
  const activePkgs = invs.filter((i) => i.status === "active")
    .sort((a, b) => b.amount - a.amount);
  const topPkg = activePkgs[0];

  const redeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || codeBusy) return;
    setCodeBusy(true); setCodeMsg(null);
    try {
      const r = await api<{ credited: number }>("/wallet/redeem-code",
        { method: "POST", body: JSON.stringify({ code }) });
      setCodeMsg({ ok: true, text: t("code_credited", { amount: `$${r.credited}` }) });
      setCode("");
      api<Wallet>("/wallet").then(setWallet).catch(() => {});
      api<Tx[]>("/wallet/transactions").then(setTxs).catch(() => {});
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const key = /invalid or expired/i.test(raw) ? "code_err_invalid"
        : /active package/i.test(raw) || /does not apply/i.test(raw) ? "code_err_no_pkg"
        : /already redeemed/i.test(raw) ? "code_err_used" : null;
      setCodeMsg({ ok: false, text: key ? t(key) : raw || "Error" });
    } finally {
      setCodeBusy(false);
    }
  };

  const realized = txs.filter((x) => x.kind === "return").reduce((s, x) => s + Number(x.amount), 0);
  const stats = [
    [t("invested"), wallet?.invested],
    [t("pending"), wallet?.pending],
    [t("realized_returns"), realized],
  ];

  return (
    <main className="page-pad">
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">

        {/* Identity line — name + active package badge */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl tracking-tight md:text-4xl">
              <span>{displayName.split(" ")[0] || me?.serial || "—"}</span>
              {topPkg && (
                <span className="inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-5 py-1.5 align-middle font-display text-lg font-semibold tracking-wide text-accent md:text-xl">
                  {topPkg.package_name}
                  {activePkgs.length > 1 && (
                    <span className="text-xs font-normal opacity-70">+{activePkgs.length - 1}</span>
                  )}
                </span>
              )}
            </h1>
            <p className="mt-2 flex items-center gap-2.5 text-xs text-muted">
              <span className="font-mono tracking-wider">{t("private_member")} · {me?.serial ?? "—"}</span>
              {me && <Stars value={me.stars ?? 4} size={11} />}
            </p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 font-display text-sm font-semibold tracking-wide text-accent">
            {initials}
          </span>
        </div>

        {/* Balance hero — warm black card, sheen number, two actions */}
        <div className="on-dark relative overflow-hidden rounded-2xl p-7 md:p-9">
          <div className="microprint absolute inset-0 opacity-60" />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/45">{t("available")}</p>
            <p className="font-display sheen mt-2 text-4xl tracking-tight min-[400px]:text-5xl md:text-6xl">
              <CountUp value={Number(wallet?.available ?? 0)} prefix="$" />
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/wallet" className="btn-ghost flex-1 md:flex-none">
                <ArrowDownToLine size={15} /> {t("deposit")}
              </Link>
              <Link href="/wallet" className="btn-ghost flex-1 md:flex-none">
                <ArrowUpFromLine size={15} /> {t("withdraw")}
              </Link>
            </div>
          </div>
        </div>

        {/* Trading code + invite link — the two daily actions side by side */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <GlassCard id="redeem" className="!p-5 md:!p-6 scroll-mt-28">
            <h2 className="font-medium">{t("code_title")}</h2>
            <p className="mt-1 text-xs text-muted">{t("code_hint")}</p>
            <form onSubmit={redeemCode} className="mt-3 flex gap-2">
              <input className="input min-w-0 flex-1 font-mono uppercase" placeholder={t("code_ph")}
                value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={32} autoComplete="off" />
              <button className="btn shrink-0" disabled={codeBusy || !code.trim()}>
                {t("code_redeem")}
              </button>
            </form>
            {codeMsg && (
              <p className={`mt-3 text-sm ${codeMsg.ok ? "text-green" : "text-red-400"}`}>{codeMsg.text}</p>
            )}
          </GlassCard>

          <GlassCard className="!p-5 md:!p-6">
            <h2 className="font-medium">{t("your_ref_link")}</h2>
            <p className="mt-1 text-xs text-muted">{t("ref_note")}</p>
            <div className="mt-3 flex gap-2">
              <input className="input min-w-0 flex-1 font-mono text-xs" readOnly
                value={me ? `${typeof window !== "undefined" ? window.location.origin : ""}/register?ref=${me.serial}` : ""} />
              <button className="btn-ghost shrink-0" disabled={!me}
                onClick={() => {
                  if (!me) return;
                  navigator.clipboard.writeText(`${window.location.origin}/register?ref=${me.serial}`)
                    .then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); });
                }}>
                {linkCopied ? t("copied") : t("copy")}
              </button>
            </div>
          </GlassCard>
        </div>

        {/* Secondary stats */}
        <div className="mt-4 grid grid-cols-3 gap-3 md:gap-4">
          {stats.map(([label, v]) => (
            <GlassCard key={label} className="glow-card !p-4 md:!p-6">
              <p className="text-[10px] uppercase tracking-widest text-muted md:text-xs">{label}</p>
              <p className="mt-2 text-lg font-semibold tracking-tight md:text-2xl">
                <CountUp value={Number(v ?? 0)} prefix="$" />
              </p>
            </GlassCard>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <GlassCard>
            <h2 className="mb-4 font-medium">{t("wallet_split")}</h2>
            <WalletSplit wallet={wallet} />
          </GlassCard>
          <GlassCard>
            <h2 className="mb-4 font-medium">{t("activity_by_type")}</h2>
            <TxBars txs={txs} />
          </GlassCard>
        </div>

        {/* Activity timeline — replaces the dense table */}
        <GlassCard className="mt-4">
          <h2 className="mb-5 font-medium">{t("recent_activity")}</h2>
          {txs.length === 0 && <p className="text-xs text-muted">{t("no_activity")}</p>}
          <ol className="relative space-y-0 border-s border-border ps-5">
            {(showAllTx ? txs : txs.slice(0, 5)).map((x) => (
              <li key={x.id} className="relative pb-5 last:pb-0">
                <span className={`absolute -start-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-bg ${
                  x.direction === "credit" ? "bg-accent" : "bg-muted"}`} />
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm capitalize">{t(x.kind)}</p>
                  <p className={`font-mono text-sm ${x.direction === "credit" ? "text-green" : "text-muted"}`}>
                    {x.direction === "credit" ? "+" : "−"}${Number(x.amount).toLocaleString("en-US")}
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {t(x.direction)} · {new Date(x.created_at).toLocaleDateString("en-US")}
                </p>
              </li>
            ))}
          </ol>
          {txs.length > 5 && (
            <button onClick={() => setShowAllTx(!showAllTx)}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-accent">
              {showAllTx ? t("show_less") : t("see_all", { n: txs.length })}
            </button>
          )}
        </GlassCard>
      </div>
    </main>
  );
}

function WalletSplit({ wallet }: { wallet: Wallet | null }) {
  const { t } = useT();
  const parts = [
    { label: t("available"), v: Number(wallet?.available ?? 0), c: "#9A742C" },
    { label: t("pending"), v: Number(wallet?.pending ?? 0), c: "#8A8375" },
    { label: t("invested"), v: Number(wallet?.invested ?? 0), c: "#162B49" },
  ];
  const total = parts.reduce((s, p) => s + p.v, 0);
  if (total <= 0) return <p className="text-xs text-muted">{t("no_balance")}</p>;
  let offset = 0;
  const R = 42, C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        {parts.filter((p) => p.v > 0).map((p) => {
          const frac = p.v / total;
          const el = (
            <circle key={p.label} cx="50" cy="50" r={R} fill="none" stroke={p.c}
              strokeWidth="10" strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-offset * C} strokeLinecap="butt" />
          );
          offset += frac;
          return el;
        })}
      </svg>
      <div className="space-y-1.5 text-xs">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.c }} />
            <span className="text-muted">{p.label}</span>
            <span className="ml-auto font-mono">${p.v.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TxBars({ txs }: { txs: Tx[] }) {
  const { t } = useT();
  const byKind = new Map<string, number>();
  for (const x of txs) {
    if (x.direction !== "credit") continue;
    byKind.set(x.kind, (byKind.get(x.kind) ?? 0) + Number(x.amount));
  }
  const rows = [...byKind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(...rows.map((r) => r[1]), 1);
  if (!rows.length) return <p className="text-xs text-muted">{t("no_activity")}</p>;
  return (
    <div className="space-y-2.5">
      {rows.map(([kind, amt]) => (
        <div key={kind}>
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="capitalize text-muted">{t(kind)}</span>
            <span className="font-mono">${amt.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/5">
            <div className="h-full rounded-full bg-accent transition-all duration-700"
              style={{ width: `${(amt / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
