"use client";

import { useT } from "@/lib/i18n";

const TONE: Record<string, string> = {
  approved: "text-green border-green/30 bg-green/5",
  paid: "text-green border-green/30 bg-green/5",
  completed: "text-green border-green/30 bg-green/5",
  active: "text-green border-green/30 bg-green/5",
  rejected: "text-red-600 border-red-600/25 bg-red-600/5",
  cancelled: "text-red-600 border-red-600/25 bg-red-600/5",
  pending: "text-amber-700 border-amber-600/30 bg-amber-500/5",
};

// One status pill for every user-facing surface — wallet, activity, anywhere.
export function StatusPill({ status }: { status: string }) {
  const { t } = useT();
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider capitalize ${
      TONE[status] ?? "text-muted border-border"}`}>
      {t(status)}
    </span>
  );
}
