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
  duration_days: number;
};

export default function Packages() {
  const { t } = useT();
  const { toast } = useToast();
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [selected, setSelected] = useState<Pkg | null>(null);
  const [ack, setAck] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Pkg[]>("/packages", { auth: false }).then(setPackages).catch(() => {});
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
    } catch (e) {
      toast(e instanceof Error ? e.message : t("failed"), "err");
    }
  };

  const scroll = (dir: number) =>
    scroller.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("packages")} />

        <div className="relative mt-8">
          <button onClick={() => scroll(-1)} aria-label="scroll left"
            className="glass absolute -left-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full md:flex">‹</button>
          <button onClick={() => scroll(1)} aria-label="scroll right"
            className="glass absolute -right-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full md:flex">›</button>

          <div ref={scroller}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {packages.map((p) => {
              const active = selected?.id === p.id;
              return (
                <button key={p.id} onClick={() => { setSelected(p); setAck(false); }}
                  className={`glass glass-hover flex aspect-square w-56 shrink-0 snap-start flex-col justify-between p-5 text-start transition ${
                    active ? "border-accent ring-1 ring-accent" : ""
                  }`}>
                  <div>
                    <p className="font-display text-xl">{p.name}</p>
                    <p className="font-display mt-1 text-3xl tracking-tight">${Number(p.min_deposit).toLocaleString()}</p>
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="text-[11px] text-muted">{t("duration")}</p>
                    <p className="font-display text-lg text-accent">{p.duration_days} {t("days")}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selected && (
          <GlassCard className="mx-auto mt-8 max-w-md">
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{t("price")}</dt><dd>${Number(selected.min_deposit).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("duration")}</dt><dd>{selected.duration_days} {t("days")}</dd></div>
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
        )}
      </div>
    </main>
  );
}
