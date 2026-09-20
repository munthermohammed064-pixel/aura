"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, PLATFORM_NAME } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { USFlag } from "@/components/USFlag";
import { Reveal } from "@/components/Reveal";
import { useT } from "@/lib/i18n";

type Pkg = {
  id: string; name: string; description: string;
  min_deposit: number; max_deposit: number;
  return_min_amount: number | null; return_max_amount: number | null;
  duration_days: number;
};

export default function Landing() {
  const { t } = useT();
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [faq, setFaq] = useState<{ q: string; a: string }[]>([]);
  const [openQ, setOpenQ] = useState<number | null>(null);

  useEffect(() => {
    api<Pkg[]>("/packages", { auth: false }).then(setPackages).catch(() => {});
    api<{ q: string; a: string }[]>("/faq", { auth: false }).then(setFaq).catch(() => {});
  }, []);

  return (
    <main>
      <Nav />
      <section className="relative flex min-h-[92vh] flex-col items-center justify-center px-4 text-center">
        <Image src="/la-hero.jpg" alt="Los Angeles skyline at night" fill priority sizes="100vw"
          className="hero-photo kenburns" />
        <div className="hero-scrim" />

        <div className="relative mx-auto max-w-6xl">
          <div className="mb-8 flex justify-center"><Logo size={72} /></div>
          <p className="mb-6 flex items-center justify-center gap-3 text-xs font-medium uppercase tracking-[0.3em] text-white/60">
            {PLATFORM_NAME} <USFlag size={30} />
          </p>
          <h1 className="font-display mx-auto max-w-3xl text-5xl tracking-tight md:text-7xl">
            {t("hero_title")}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-white/75">
            {t("hero_sub")}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="#packages" className="btn-ghost">{t("view_packages")}</Link>
          </div>

        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <Reveal>
          <div className="photo-band relative h-64 overflow-hidden md:h-80">
            <Image src="/la-skyline.jpg" alt="Los Angeles at night" fill sizes="(max-width:768px) 100vw, 1152px"
              className="kenburns object-cover" />
            <div className="absolute bottom-5 left-6 z-10">
              <p className="text-xs uppercase tracking-[0.3em] text-white/60">{PLATFORM_NAME}</p>
              <p className="font-display text-xl">{t("photo_band_caption")}</p>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="packages" className="mx-auto max-w-6xl px-4 pb-24">
        <Reveal>
          <h2 className="font-display text-center text-2xl">{t("packages")}</h2><div className="rule-gold" />
        </Reveal>
        <Reveal>
          <div className="surface overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-widest text-muted">
                  <th className="px-5 py-3.5 text-start font-medium">{t("name")}</th>
                  <th className="px-5 py-3.5 text-start font-medium">{t("price")}</th>
                  <th className="px-5 py-3.5 text-start font-medium">{t("daily")}</th>
                  <th className="px-5 py-3.5 text-start font-medium">{t("duration")}</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 transition last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <span className="font-display text-base">{p.name}</span>
                      {p.description && <span className="mt-0.5 block text-xs text-muted">{p.description}</span>}
                    </td>
                    <td className="px-5 py-4 font-display text-lg text-accent">
                      ${Number(p.min_deposit).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-white/85">
                      {p.return_min_amount != null ? `$${p.return_min_amount} – $${p.return_max_amount}` : "—"}
                    </td>
                    <td className="px-5 py-4 text-muted">{p.duration_days} {t("days")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!packages.length && <p className="px-5 py-8 text-center text-muted">{t("no_packages")}</p>}
          </div>
        </Reveal>
      </section>

      {faq.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 pb-24">
          <Reveal>
            <h2 className="font-display text-center text-2xl">{t("faq_title")}</h2><div className="rule-gold" />
          </Reveal>
          <div className="space-y-3">
            {faq.map((f, i) => (
              <Reveal key={i} delay={i * 80}>
                <button onClick={() => setOpenQ(openQ === i ? null : i)}
                  className="surface block w-full px-6 py-4 text-start transition hover:border-white/15">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium">{f.q}</p>
                    <span className={`text-muted transition-transform ${openQ === i ? "rotate-45" : ""}`}>+</span>
                  </div>
                  {openQ === i && <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>}
                </button>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-border py-8 text-center text-xs text-muted">
        <div className="mb-2 flex justify-center gap-4">
          <Link href="/legal/terms" className="hover:text-white">{t("terms")}</Link>
          <Link href="/legal/privacy" className="hover:text-white">{t("privacy")}</Link>
        </div>
        {PLATFORM_NAME}
      </footer>
    </main>
  );
}
