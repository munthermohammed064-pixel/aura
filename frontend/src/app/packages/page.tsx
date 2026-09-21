"use client";

import { useEffect, useRef, useState } from "react";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/Toast";

type Pkg = {
  id: string; name: string; description: string;
  min_deposit: number; max_deposit: number;
  return_min_amount: number | null; return_max_amount: number | null;
  duration_days: number;
};

export default function Packages() {
  const { t } = useT();
  const { toast } = useToast();
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [selected, setSelected] = useState<Pkg | null>(null);
  const [ack, setAck] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Pkg[]>("/packages", { auth: false })
      .then((rows) => setPackages([...rows].sort((a, b) => a.min_deposit - b.min_deposit)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  const invest = async () => {
    if (!selected) return;
    if (!ack) return toast(t("ack_first"), "err");
    try {
      await api("/invest", {
        method: "POST",
        body: JSON.stringify({
          package_id: selected.id,
          amount: selected.min_deposit,
          acknowledge_risk: true,
        }),
      });
      toast(t("pkg_activated"));
      setAck(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("failed"), "err");
    }
  };

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("packages")} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p, i) => {
            const active = selected?.id === p.id;
            return (
              <button key={p.id} onClick={() => { setSelected(p); setAck(false); }}
                className={`surface glow-card flex flex-col p-5 text-start ${active ? "gold-edge" : ""}`}>
                <div className="flex items-center justify-between">
                  <p className="font-display text-xl">{p.name}</p>
                  <span dir="ltr" className="flex items-end gap-[3px]" title={`${t("level")} ${i + 1}`}>
                    {Array.from({ length: 9 }).map((_, b) => (
                      <span key={b} style={{ height: `${4 + b}px` }}
                        className={`w-[3px] rounded-full ${b <= i ? "bg-accent" : "bg-white/10"}`} />
                    ))}
                  </span>
                </div>
                <p className="font-display mt-2 text-4xl tracking-tight">${Number(p.min_deposit).toLocaleString()}</p>
                <div className="mt-auto border-t border-border pt-3">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[10px] uppercase tracking-widest text-muted">{t("daily")}</p>
                    <p className="font-display text-lg text-accent">
                      {p.return_min_amount != null ? `> $${p.return_min_amount}` : "—"}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{p.duration_days} {t("days")} · {t("incl_weekends")}</p>
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div ref={detailRef}>
          <GlassCard className="mx-auto mt-8 max-w-md gold-edge">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{selected.name}</h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                {t("level")} {packages.indexOf(selected) + 1}/9
              </span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{t("price")}</dt><dd>${Number(selected.min_deposit).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("daily")}</dt><dd>{selected.return_min_amount != null ? `> $${selected.return_min_amount}` : "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("duration")}</dt><dd>{selected.duration_days} {t("days")} · {t("incl_weekends")}</dd></div>
            </dl>
            <label className="mt-3 flex items-start gap-2 text-xs text-muted">
              <input type="checkbox" className="mt-0.5" checked={ack}
                onChange={(e) => setAck(e.target.checked)} />
              {t("reg_ack")}
            </label>
            <button className="btn mt-4 w-full" onClick={invest}>
              {t("activate_for")} ${Number(selected.min_deposit).toLocaleString()}
            </button>
          </GlassCard>
          </div>
        )}
      </div>
    </main>
  );
}
