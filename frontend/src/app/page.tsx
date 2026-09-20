"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { GlassCard } from "@/components/Glass";
import { api, PLATFORM_NAME } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { USFlag } from "@/components/USFlag";
import { Reveal } from "@/components/Reveal";
import { useT } from "@/lib/i18n";

type Pkg = {
  id: string; name: string; description: string;
  min_deposit: number; max_deposit: number;
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
            {PLATFORM_NAME} <USFlag size={18} />
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
          <h2 className="font-display text-center text-2xl">{t("how_it_works")}</h2><div className="rule-gold" />
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["1", t("step1_t"), t("step1_d")],
            ["2", t("step2_t"), t("step2_d")],
            ["3", t("step3_t"), t("step3_d")],
          ].map(([n, tt, d], idx) => (
            <Reveal key={n} delay={idx * 120}>
              <GlassCard hover>
                <div className="mb-3 text-xs text-muted">{n}</div>
                <h3 className="mb-2 font-medium">{tt}</h3>
                <p className="text-sm text-muted">{d}</p>
              </GlassCard>
            </Reveal>
          ))}
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
        <div className="grid gap-4 md:grid-cols-3">
          {packages.map((p, idx) => (
            <Reveal key={p.id} delay={idx * 100}>
            <GlassCard hover className="flex flex-col h-full">
              <h3 className="font-display text-lg">{p.name}</h3>
              <p className="mt-1 text-sm text-muted">{p.description}</p>
              <div className="font-display my-5 text-3xl tracking-tight">
                ${Number(p.min_deposit).toLocaleString()}
              </div>
              <dl className="mt-5 space-y-1 text-sm text-muted">
                <div className="flex justify-between"><dt>{t("duration")}</dt><dd>{p.duration_days} {t("days")}</dd></div>
              </dl>
              <Link href="/register" className="btn mt-6 w-full">{t("get_started")}</Link>
            </GlassCard>
            </Reveal>
          ))}
          {!packages.length && <p className="col-span-3 text-center text-muted">{t("no_packages")}</p>}
        </div>
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
