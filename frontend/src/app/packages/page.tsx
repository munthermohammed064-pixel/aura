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

// 0–2 entry: light cards · 3–5 core: warm black · 6–8 prestige: champagne edge
const tierClass = (i: number) =>
  i <= 2 ? "surface" : i <= 5 ? "on-dark surface" : "on-dark surface gold-edge";

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
      setSelected(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("failed"), "err");
    }
  };

  const Summary = ({ sheet = false }: { sheet?: boolean }) => selected && (
    <div className={sheet ? "" : "glass microprint p-6"}>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">{selected.name}</h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {t("level")} {packages.indexOf(selected) + 1}/9
        </span>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-muted">{t("price")}</dt><dd className="font-display text-lg text-accent">${Number(selected.min_deposit).toLocaleString()}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{t("daily")}</dt><dd>{selected.return_min_amount != null ? `> $${selected.return_min_amount}` : "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{t("duration")}</dt><dd>{selected.duration_days} {t("days")} · {t("incl_weekends")}</dd></div>
      </dl>
      <label className="mt-4 flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" className="mt-0.5 accent-[#9A742C]" checked={ack}
          onChange={(e) => setAck(e.target.checked)} />
        {t("reg_ack")}
      </label>
      <button className="btn mt-4 w-full" onClick={invest}>
        {t("activate_for")} ${Number(selected.min_deposit).toLocaleString()}
      </button>
    </div>
  );

  return (
    <main className="page-pad">
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("packages")} />

        <div className={selected ? "lg:grid lg:grid-cols-[1fr_330px] lg:gap-6 lg:items-start" : ""}>
          <div className={`grid gap-4 sm:grid-cols-2 ${selected ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
            {packages.map((p, i) => {
              const active = selected?.id === p.id;
              const dark = i > 2; // tiers 3+ sit on warm black
              return (
                <button key={p.id} onClick={() => { setSelected(p); setAck(false); }}
                  className={`${tierClass(i)} glow-card flex flex-col p-5 text-start ${active ? "gold-edge" : ""}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-display text-xl">{p.name}</p>
                    <span dir="ltr" className="flex items-end gap-[3px]" title={`${t("level")} ${i + 1}`}>
                      {Array.from({ length: 9 }).map((_, b) => (
                        <span key={b} style={{ height: `${4 + b}px` }}
                          className={`w-[3px] rounded-full ${b <= i ? "bg-accent" : dark ? "bg-white/10" : "bg-ink/10"}`} />
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

          {/* Desktop — sticky purchase summary beside the grid */}
          {selected && (
            <aside ref={detailRef} className="mt-6 hidden lg:sticky lg:top-24 lg:mt-0 lg:block">
              <Summary />
            </aside>
          )}
        </div>
      </div>

      {/* Mobile — bottom sheet confirmation */}
      {selected && (
        <>
          <div className="sheet-backdrop lg:hidden" onClick={() => setSelected(null)} />
          <div className="sheet on-dark glass max-h-[80vh] overflow-y-auto p-6 lg:hidden">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <Summary sheet />
          </div>
        </>
      )}
    </main>
  );
}
