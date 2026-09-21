"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Inv = {
  id: string; package_name: string; amount: number; status: string;
  realized_return: number; started_at: string; ends_at: string;
  return_min_amount: number | null; return_max_amount: number | null;
};

function progress(i: Inv): number {
  const start = new Date(i.started_at).getTime();
  const end = new Date(i.ends_at).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

export default function MyPackages() {
  const { t } = useT();
  const [invs, setInvs] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Inv[]>("/investments").then(setInvs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const active = invs.filter((i) => i.status === "active");
  const done = invs.filter((i) => i.status !== "active");

  const Card = ({ i }: { i: Inv }) => {
    const pct = progress(i);
    const daysLeft = Math.max(0, Math.ceil((new Date(i.ends_at).getTime() - Date.now()) / 86400000));
    return (
      <GlassCard>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-xl">{i.package_name}</p>
            <p className="font-display mt-1 text-3xl tracking-tight">${i.amount.toLocaleString()}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs ${
            i.status === "active" ? "bg-accent/15 text-accent" : "bg-white/10 text-muted"
          }`}>
            {i.status === "active" ? t("days_left_fmt").replace("{n}", String(daysLeft)) : t("completed")}
          </span>
        </div>
        <div className="mt-5">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>{new Date(i.started_at).toLocaleDateString()}</span>
            <span>{new Date(i.ends_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="mt-4 flex justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted">{t("daily")}</span>
          <span>
            {i.return_min_amount != null ? `> $${i.return_min_amount}` : "—"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">{t("realized_return")}</span>
          <span className="text-accent">${i.realized_return.toLocaleString()}</span>
        </div>
      </GlassCard>
    );
  };

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("my_packages")} />

        {loading ? (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((n) => <div key={n} className="surface h-48 animate-pulse" />)}
          </div>
        ) : invs.length === 0 ? (
          <GlassCard className="mt-6 text-center">
            <p className="text-muted">{t("no_investments")}</p>
            <Link href="/packages" className="btn mt-4">{t("browse_packages")}</Link>
          </GlassCard>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <h2 className="mt-6 mb-3 text-sm font-medium text-muted">{t("active")}</h2>
                <div className="grid gap-4 md:grid-cols-3">{active.map((i) => <Card key={i.id} i={i} />)}</div>
              </>
            )}
            {done.length > 0 && (
              <>
                <h2 className="mt-6 mb-3 text-sm font-medium text-muted">{t("completed")}</h2>
                <div className="grid gap-4 md:grid-cols-3">{done.map((i) => <Card key={i.id} i={i} />)}</div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
