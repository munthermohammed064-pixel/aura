"use client";

import { use, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { Disclaimer, GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function LegalPage({ params }: { params: Promise<{ page: string }> }) {
  const { t } = useT();
  const { page } = use(params);
  const [content, setContent] = useState("");

  useEffect(() => {
    api<{ content: string }>(`/legal/${page}`, { auth: false })
      .then((r) => setContent(r.content)).catch(() => setContent(""));
  }, [page]);

  return (
    <main>
      <Nav />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <GlassCard>
          <h1 className="mb-6 text-2xl font-semibold capitalize">{t(`legal_${page}`) === `legal_${page}` ? page : t(`legal_${page}`)}</h1>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{content}</p>
          {page === "privacy" && (
            <div className="mt-6">
              <Disclaimer>{t("reg_disclaimer")}</Disclaimer>
            </div>
          )}
        </GlassCard>
      </div>
    </main>
  );
}
