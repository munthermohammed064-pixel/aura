"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { CountUp } from "@/components/CountUp";
import { GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Stars } from "@/components/Stars";

type Wallet = { available: number; pending: number; invested: number };
type Tx = { id: string; kind: string; direction: string; amount: number; created_at: string };
export default function Dashboard() {
  const { t } = useT();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);

  const [serial, setSerial] = useState("");
  const [stars, setStars] = useState(4);

  useEffect(() => {
    api<Wallet>("/wallet").then(setWallet).catch(() => {});
    api<Tx[]>("/wallet/transactions").then(setTxs).catch(() => {});
    api<{ serial: string; stars: number }>("/auth/me").then((u) => {
      setSerial(u.serial); setStars(u.stars ?? 4);
    }).catch(() => {});
  }, []);

  const stats = [
    [t("available"), wallet?.available],
    [t("pending"), wallet?.pending],
    [t("invested"), wallet?.invested],
    [t("realized_returns"), txs.filter((x) => x.kind === "return").reduce((s, x) => s + Number(x.amount), 0)],
  ];

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("dashboard")}
          right={
            <span className="flex items-center gap-3">
              <span className="surface flex items-center gap-2 px-3 py-1.5" title={t("your_stars")}>
                <Stars value={stars} size={14} />
              </span>
              {serial && <span className="surface px-3 py-1.5 font-mono text-xs text-accent">{serial}</span>}
            </span>
          } />
        <div className="grid gap-4 md:grid-cols-4">
          {stats.map(([label, v]) => (
            <GlassCard key={label} className="glow-card">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
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

        <GlassCard className="mt-4">
          <h2 className="mb-4 font-medium">{t("recent_activity")}</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted">
              <th className="pb-2">{t("type")}</th><th className="pb-2">{t("direction")}</th>
              <th className="pb-2">{t("amount")}</th><th className="pb-2">{t("date")}</th>
            </tr></thead>
            <tbody>
              {txs.slice(0, 15).map((x) => (
                <tr key={x.id} className="border-t border-border">
                  <td className="py-2 capitalize">{t(x.kind)}</td>
                  <td className="py-2">{t(x.direction)}</td>
                  <td className="py-2">${Number(x.amount).toLocaleString()}</td>
                  <td className="py-2 text-muted">{new Date(x.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      </div>
    </main>
  );
}

function WalletSplit({ wallet }: { wallet: Wallet | null }) {
  const { t } = useT();
  const parts = [
    { label: t("available"), v: Number(wallet?.available ?? 0), c: "#c9a962" },
    { label: t("pending"), v: Number(wallet?.pending ?? 0), c: "#9b9ba1" },
    { label: t("invested"), v: Number(wallet?.invested ?? 0), c: "#5a7d9a" },
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
            <span className="ml-auto font-mono">${p.v.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
            <span className="font-mono">${amt.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-accent transition-all duration-700"
              style={{ width: `${(amt / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
