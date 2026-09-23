"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { CountUp } from "@/components/CountUp";
import { Disclaimer, GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Empty } from "@/components/Empty";
import { Users } from "lucide-react";

type Data = {
  code: string; link: string; total_earned: number;
  referred: { id: string; email: string; joined: string }[];
  commissions: { id: string; level: number; pct: number; amount: number; created_at: string }[];
  pcts: Record<string, number>; note: string;
};

export default function Referrals() {
  const { t } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api<Data>("/referrals").then(setData).catch(() => {}); }, []);

  const copy = () => {
    if (data) navigator.clipboard.writeText(data.link).then(() => setCopied(true));
  };

  return (
    <main className="page-pad">
      <Nav />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <PageHeader title={t("referrals")} />
        <GlassCard>
          <p className="text-xs text-muted">{t("your_ref_link")}</p>
          <div className="mt-2 flex gap-2">
            <input className="input" readOnly value={data?.link ?? ""} />
            <button className="btn-ghost shrink-0" onClick={copy}>{copied ? t("copied") : t("copy")}</button>
          </div>
          <p className="mt-3 text-xs text-muted">{t("code")} <span className="text-ink">{data?.code}</span></p>
          <div className="mt-4"><Disclaimer>{t("reward_note")}</Disclaimer></div>
        </GlassCard>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <GlassCard className="glow-card">
            <p className="text-xs text-muted">{t("rewards_earned")}</p>
            <p className="mt-2 text-2xl font-semibold">
              <CountUp value={Number(data?.total_earned ?? 0)} prefix="$" />
            </p>
          </GlassCard>
          <GlassCard className="glow-card">
            <p className="text-xs text-muted">{t("invited_users")}</p>
            <p className="mt-2 text-2xl font-semibold">
              <CountUp value={data?.referred.length ?? 0} decimals={0} />
            </p>
          </GlassCard>
        </div>

        <GlassCard className="mt-4">
          <h2 className="mb-4 font-medium">{t("invited_users")}</h2>
          {data?.referred.length === 0 && <Empty icon={Users} text={t("no_referred")} />}
          <table className="w-full text-sm">
            <tbody>{data?.referred.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="break-all py-2">{u.email}</td>
                <td className="py-2 text-right text-muted">{new Date(u.joined).toLocaleDateString("en-US")}</td>
              </tr>
            ))}</tbody>
          </table>
        </GlassCard>

        <GlassCard className="mt-4">
          <h2 className="mb-4 font-medium">{t("rewards_earned")}</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted">
              <th className="pb-2">{t("level")}</th><th className="pb-2">{t("rate")}</th>
              <th className="pb-2">{t("amount")}</th><th className="pb-2">{t("date")}</th>
            </tr></thead>
            <tbody>{data?.commissions.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="py-2">L{c.level}</td>
                <td className="py-2">{c.pct}%</td>
                <td className="py-2">${Number(c.amount).toLocaleString("en-US")}</td>
                <td className="py-2 text-muted">{new Date(c.created_at).toLocaleDateString("en-US")}</td>
              </tr>
            ))}</tbody>
          </table>
        </GlassCard>
      </div>
    </main>
  );
}
