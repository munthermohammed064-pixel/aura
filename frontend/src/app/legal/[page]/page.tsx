"use client";

import { use, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { Disclaimer, GlassCard } from "@/components/Glass";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function LegalPage({ params }: { params: Promise<{ page: string }> }) {
  const { t, lang } = useT();
  const { page } = use(params);
  const [doc, setDoc] = useState<{ content: string; versions?: Record<string, string> }>({ content: "" });

  useEffect(() => {
    api<{ content: string; versions?: Record<string, string> }>(`/legal/${page}`, { auth: false })
      .then(setDoc).catch(() => setDoc({ content: "" }));
  }, [page]);

  // `<page>_<lang>` is an admin-authored translation; `content` is the default.
  const content = doc.versions?.[`${page}_${lang}`] || doc.content;

  return (
    <main className="pb-20 md:pb-0">
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
