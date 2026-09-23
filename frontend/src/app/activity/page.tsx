"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/Glass";
import { Empty } from "@/components/Empty";
import { SkeletonRows } from "@/components/Skeleton";
import { Pager, PAGE_SIZE } from "@/components/Pager";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Activity } from "lucide-react";

type Tx = { id: string; kind: string; direction: string; amount: number; created_at: string };
type Row = { id: string; amount: number; status: string; created_at: string };

type Item = { id: string; kind: string; amount: number; at: string; dir: string; status: string | null };

export default function ActivityPage() {
  const { t } = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);
  const [page, setPage] = useState(0);

  const load = () => {
    setLoading(true); setLoadErr(false);
    let failed = false;
    const fail = () => { failed = true; };
    Promise.all([
      api<Tx[]>("/wallet/transactions").catch(() => { fail(); return [] as Tx[]; }),
      api<Row[]>("/deposits").catch(() => { fail(); return [] as Row[]; }),
      api<Row[]>("/withdrawals").catch(() => { fail(); return [] as Row[]; }),
    ]).then(([txs, deps, wds]) => {
      const ledger: Item[] = txs.map((x) => ({
        id: `t${x.id}`, kind: x.kind, amount: x.amount, at: x.created_at,
        dir: x.direction, status: null,
      }));
      const depItems: Item[] = deps.map((d) => ({
        id: `d${d.id}`, kind: "deposit", amount: d.amount, at: d.created_at,
        dir: "credit", status: d.status,
      }));
      const wdItems: Item[] = wds.map((w) => ({
        id: `w${w.id}`, kind: "withdrawal", amount: w.amount, at: w.created_at,
        dir: "debit", status: w.status,
      }));
      setItems([...ledger, ...depItems, ...wdItems]
        .sort((a, b) => +new Date(b.at) - +new Date(a.at)));
      setLoading(false); setLoadErr(failed);
    });
  };
  useEffect(load, []);

  const statusTone = (s: string) =>
    s === "approved" || s === "paid" || s === "completed" ? "text-green border-green/30 bg-green/5"
    : s === "rejected" ? "text-red-600 border-red-600/25 bg-red-600/5"
    : "text-amber-700 border-amber-600/30 bg-amber-500/5";

  return (
    <main className="page-pad">
      <Nav />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <PageHeader title={t("account_activity")} />

        {loadErr && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-red-600/25 bg-red-600/5 px-4 py-2.5">
            <p className="text-xs text-red-700">{t("load_failed")}</p>
            <button onClick={load} className="text-xs font-medium text-accent hover:underline">{t("retry")}</button>
          </div>
        )}

        <GlassCard>
          {loading ? (
            <SkeletonRows n={6} />
          ) : items.length === 0 ? (
            <Empty icon={Activity} text={t("no_activity")} />
          ) : (
            <>
              <ol className="relative space-y-0 border-s border-border ps-5">
                {items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((x) => (
                  <li key={x.id} className="relative pb-5 last:pb-0">
                    <span className={`absolute -start-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-bg ${
                      x.dir === "credit" ? "bg-accent" : "bg-muted"}`} />
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="flex min-w-0 items-center gap-2 text-sm capitalize">
                        <span className="truncate">{t(x.kind)}</span>
                        {x.status && (
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ${statusTone(x.status)}`}>
                            {t(x.status)}
                          </span>
                        )}
                      </p>
                      <p className={`shrink-0 font-mono text-sm ${x.dir === "credit" ? "text-green" : "text-muted"}`}>
                        {x.dir === "credit" ? "+" : "−"}${Number(x.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {new Date(x.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </li>
                ))}
              </ol>
              <Pager total={items.length} page={page} setPage={setPage} />
            </>
          )}
        </GlassCard>
      </div>
    </main>
  );
}
