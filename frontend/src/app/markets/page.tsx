"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Prices = Record<string, { usd: number; usd_24h_change?: number }>;

export default function Markets() {
  const { t } = useT();
  const [prices, setPrices] = useState<Prices>({});

  const load = () => api<Prices>("/markets/prices").then(setPrices).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("markets")} />
        <div className="grid gap-4 md:grid-cols-4">
          {Object.entries(prices).map(([id, p]) => (
            <GlassCard key={id} hover>
              <p className="text-sm capitalize text-muted">{id}</p>
              <p className="mt-2 text-2xl font-semibold">${p.usd.toLocaleString()}</p>
              <p className={`mt-1 text-xs ${(p.usd_24h_change ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {(p.usd_24h_change ?? 0).toFixed(2)}% 24h
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </main>
  );
}
