"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { CountUp } from "@/components/CountUp";
import { Disclaimer, GlassCard } from "@/components/Glass";
import { api, API_URL } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import { SkeletonRows } from "@/components/Skeleton";
import { useNotifyStream } from "@/lib/useNotifyStream";

type Method = { id: string; name: string; details: string; qr_image: string; min_amount: number; max_amount: number };
type Wallet = { available: number; pending: number; invested: number };
type Row = { id: string; amount: number; status: string; created_at: string; method?: string; address?: string; fee?: number; star_penalty?: number };
type Me = { default_withdraw_address: string | null; stars: number };

export default function WalletPage() {
  const { t } = useT();
  const { toast } = useToast();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [methods, setMethods] = useState<Method[]>([]);
  const [deposits, setDeposits] = useState<Row[]>([]);
  const [withdrawals, setWithdrawals] = useState<Row[]>([]);
  const [dep, setDep] = useState({ amount: "", method: "", proof: "" });
  const [shot, setShot] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [wd, setWd] = useState({ amount: "", address: "" });
  const [whitelist, setWhitelist] = useState<string | null>(null);
  const [stars, setStars] = useState(4);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api<Wallet>("/wallet").then(setWallet).catch(() => {});
    api<Method[]>("/payment-methods").then((m) => {
      setMethods(m);
      if (m[0]) setDep((d) => ({ ...d, method: d.method || m[0].name }));
    }).catch(() => {});
    api<Row[]>("/deposits").then(setDeposits).catch(() => {});
    api<Row[]>("/withdrawals").then(setWithdrawals).catch(() => {});
    api<Me>("/auth/me").then((u) => {
      setWhitelist(u.default_withdraw_address);
      setStars(u.stars ?? 4);
      if (u.default_withdraw_address) setWd((w) => ({ ...w, address: u.default_withdraw_address! }));
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    const id = setInterval(load, 30000); // slow fallback — SSE below is the realtime path
    return () => clearInterval(id);
  }, []);
  // Instant refresh: deposit approval / withdrawal processing / settlement all
  // push a notification — reload balances the moment it arrives.
  useNotifyStream(() => load());

  const submitDeposit = async () => {
    if (!shot) return toast(t("shot_required"), "err");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", shot);
      const up = await api<{ path: string }>("/uploads", { method: "POST", body: fd });
      await api("/deposits", {
        method: "POST",
        body: JSON.stringify({ ...dep, amount: Number(dep.amount), screenshot: up.path }),
      });
      toast(t("dep_submitted"));
      setShot(null);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : t("failed"), "err"); }
    setUploading(false);
  };

  const isWeekend = [0, 6].includes(new Date().getUTCDay());

  const submitWithdrawal = async () => {
    try {
      await api("/withdrawals", { method: "POST", body: JSON.stringify({ ...wd, amount: Number(wd.amount) }) });
      toast(t("wd_submitted"));
      load();
    } catch (e) { toast(e instanceof Error ? e.message : t("failed"), "err"); }
  };

  const Step = ({ n, label, done }: { n: number; label: string; done?: boolean }) => (
    <div className="mb-2 flex items-center gap-2">
      <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold transition ${
        done ? "bg-accent text-black" : "border border-border text-muted"
      }`}>{n}</span>
      <span className="text-[11px] uppercase tracking-widest text-muted">{label}</span>
    </div>
  );

  const Table = ({ rows }: { rows: Row[] }) => (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-muted">
        <th className="pb-2">{t("amount")}</th><th className="pb-2">{t("status")}</th><th className="pb-2">{t("date")}</th>
      </tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id} className="border-t border-border">
          <td className="py-2">
            ${Number(r.amount).toLocaleString("en-US")}
            {(r.star_penalty ?? 0) > 0 && (
              <p className="text-[10px] text-red-600">−${Number(r.star_penalty).toLocaleString("en-US")} {t("star_penalty")}</p>
            )}
          </td>
          <td className="py-2 capitalize">{t(r.status)}</td>
          <td className="py-2 text-muted">{new Date(r.created_at).toLocaleDateString("en-US")}</td>
        </tr>
      ))}</tbody>
    </table>
  );

  return (
    <main className="page-pad">
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("wallet")} />
        <div className="grid gap-4 md:grid-cols-3">
          {(["available", "pending", "invested"] as const).map((k) => (
            <GlassCard key={k} className="glow-card">
              <p className="text-xs text-muted">{t(k)}</p>
              <p className="mt-2 text-2xl font-semibold">
                <CountUp value={Number(wallet?.[k] ?? 0)} prefix="$" />
              </p>
            </GlassCard>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <GlassCard>
            <h2 className="mb-4 font-medium">{t("deposit")}</h2>
            <Step n={1} label={t("step_method")} done={!!dep.method} />
            {/* payment picker — glass cards, not a dropdown */}
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              {methods.map((m) => {
                const sel = dep.method === m.name;
                return (
                  <button key={m.id} type="button" onClick={() => setDep({ ...dep, method: m.name })}
                    className={`glass flex items-center gap-3 !rounded-xl px-3.5 py-3 text-start transition ${
                      sel ? "!border-accent/60 ring-1 ring-accent/30" : "hover:border-ink/20"
                    }`}>
                    {m.qr_image ? (
                      <img src={`${API_URL.replace("/api", "")}${m.qr_image}`} alt=""
                        className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border font-display text-sm text-accent">
                        {m.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      <span className="block font-mono text-[10px] text-muted">
                        ${m.min_amount} – ${Number(m.max_amount).toLocaleString("en-US")}
                      </span>
                    </span>
                  </button>
                );
              })}
              {!methods.length && <p className="col-span-full text-xs text-muted">{t("no_methods")}</p>}
            </div>
            {(() => {
              const m = methods.find((x) => x.name === dep.method);
              return m ? (
                <div className="mb-3">
                  {m.qr_image && (
                    <img src={`${API_URL.replace("/api", "")}${m.qr_image}`} alt="Payment QR"
                      className="mx-auto mb-2 h-40 w-40 rounded-xl border border-border bg-white object-contain p-1" />
                  )}
                  {m.details && <p className="whitespace-pre-wrap break-all rounded-xl bg-ink/[0.04] px-3 py-2 font-mono text-xs text-muted">{m.details}</p>}
                </div>
              ) : null;
            })()}
            <Step n={2} label={t("step_proof")} done={!!shot} />
            {shot ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-accent/30">
                <img src={URL.createObjectURL(shot)} alt="Payment proof"
                  className="max-h-44 w-full object-contain bg-black/40" />
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="truncate text-[10px] text-muted">{shot.name}</p>
                  <label className="cursor-pointer text-[10px] text-accent hover:underline">
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={(e) => setShot(e.target.files?.[0] ?? null)} />
                    {t("change_image")}
                  </label>
                </div>
              </div>
            ) : (
              <label className="mb-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border px-4 py-6 text-xs text-muted transition hover:border-accent">
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={(e) => setShot(e.target.files?.[0] ?? null)} />
                {t("upload_screenshot")}
              </label>
            )}
            {shot && (
              <>
                <Step n={3} label={t("step_amount")} done={!!dep.amount} />
                <input className="input mb-3" type="number" placeholder={t("amount")}
                  value={dep.amount} onChange={(e) => setDep({ ...dep, amount: e.target.value })} />
                <input className="input mb-3" placeholder={t("txid_ph")}
                  value={dep.proof} onChange={(e) => setDep({ ...dep, proof: e.target.value })} />
                <Disclaimer>{t("dep_disclaimer")}</Disclaimer>
                <button className="btn mt-4 w-full" onClick={submitDeposit} disabled={uploading}>
                  {uploading ? t("uploading") : t("submit_deposit")}
                </button>
              </>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="mb-4 font-medium">{t("withdraw")}</h2>
            <input className="input mb-3" type="number" placeholder={t("amount")}
              value={wd.amount} onChange={(e) => setWd({ ...wd, amount: e.target.value })} />
            {whitelist ? (
              <div className="mb-3">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-muted">{t("approved_address")}</p>
                <p className="break-all rounded-xl bg-ink/[0.04] px-3 py-2 font-mono text-xs">{whitelist}</p>
              </div>
            ) : (
              <p className="mb-3 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-muted">
                {t("set_whitelist_first")}
              </p>
            )}
            {stars < 4 && (
              <p className="mb-3 rounded-xl border border-red-600/30 bg-red-600/5 px-3 py-2 text-xs text-red-700">
                {t("star_penalty_note").replace("{n}", String(4 - stars)).replace("{pct}", String((4 - stars) * 25))}
              </p>
            )}
            {isWeekend && (
              <p className="mb-3 rounded-xl border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                {t("wd_weekend_closed")}
              </p>
            )}
            <Disclaimer>{t("wd_disclaimer")}</Disclaimer>
            <button className="btn mt-4 w-full disabled:opacity-50" onClick={submitWithdrawal} disabled={isWeekend}>{t("request_withdrawal")}</button>
          </GlassCard>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <GlassCard><h2 className="mb-4 font-medium">{t("deposits")}</h2>
            {loading ? <SkeletonRows n={3} /> : <Table rows={deposits} />}</GlassCard>
          <GlassCard><h2 className="mb-4 font-medium">{t("withdrawals")}</h2>
            {loading ? <SkeletonRows n={3} /> : <Table rows={withdrawals} />}</GlassCard>
        </div>
      </div>
    </main>
  );
}
