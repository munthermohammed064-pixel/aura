"use client";

import { useT } from "@/lib/i18n";

export const PAGE_SIZE = 15;

export function Pager({ total, page, setPage }: { total: number; page: number; setPage: (n: number) => void }) {
  const { t } = useT();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const cur = Math.min(page, pages - 1);
  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-xs text-muted">
      <button disabled={cur <= 0} onClick={() => setPage(cur - 1)}
        className="btn-ghost px-3 py-1 disabled:opacity-30">{t("prev")}</button>
      <span className="tabular-nums">{cur + 1} / {pages}</span>
      <button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}
        className="btn-ghost px-3 py-1 disabled:opacity-30">{t("next")}</button>
    </div>
  );
}
