"use client";

import { useT } from "@/lib/i18n";
import { Seal } from "@/components/Seal";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useT();
  return (
    <main className="grid min-h-svh place-items-center px-6">
      <div className="surface w-full max-w-sm p-8 text-center">
        <Seal size={64} className="mx-auto" />
        <h1 className="font-display mt-5 text-2xl tracking-tight">{t("error_title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("error_body")}</p>
        <button className="btn mt-6 w-full" onClick={reset}>{t("retry")}</button>
      </div>
    </main>
  );
}
