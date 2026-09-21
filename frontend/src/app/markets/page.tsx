"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Prices = Record<string, { usd: number; usd_24h_change?: number }>;
type Fx = { date: string | null; pairs: { pair: string; rate: number }[] };

export default function Markets() {
  const { t } = useT();
  const [prices, setPrices] = useState<Prices>({});
  const [fx, setFx] = useState<Fx>({ date: null, pairs: [] });

  const load = () => api<Prices>("/markets/prices").then(setPrices).catch(() => {});
  useEffect(() => {
    load();
    api<Fx>("/markets/forex").then(setFx).catch(() => {});
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="pb-20 md:pb-0">
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("markets")} />

        <div className="grid gap-4 md:grid-cols-4">
          {Object.entries(prices).map(([id, p]) => (
            <GlassCard key={id} hover>
              <p className="text-sm capitalize text-muted">{id}</p>
              <p className="mt-2 text-2xl font-semibold">${p.usd.toLocaleString()}</p>
              <p className={`mt-1 text-xs ${(p.usd_24h_change ?? 0) >= 0 ? "text-green-700" : "text-red-600"}`}>
                {(p.usd_24h_change ?? 0).toFixed(2)}% 24h
              </p>
            </GlassCard>
          ))}
        </div>

        <div className="mt-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-xl tracking-tight">{t("forex")}</h2>
            <p className="text-[10px] uppercase tracking-widest text-muted">
              {t("fx_ecb")}{fx.date ? ` · ${fx.date}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {fx.pairs.map((p) => (
              <GlassCard key={p.pair} hover className="!p-4">
                <p className="font-mono text-xs text-muted">{p.pair}</p>
                <p className="font-display mt-1.5 text-xl tracking-tight">{p.rate.toLocaleString(undefined, { minimumFractionDigits: 4 })}</p>
              </GlassCard>
            ))}
            {fx.pairs.length === 0 && (
              <GlassCard className="col-span-full !p-4">
                <p className="text-sm text-muted">{t("fx_unavailable")}</p>
              </GlassCard>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
