"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, PLATFORM_NAME } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { USFlag } from "@/components/USFlag";
import { Reveal } from "@/components/Reveal";
import { Seal } from "@/components/Seal";
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

  const glance = [packages[2], packages[5], packages[8]].filter(Boolean);

  return (
    <main className="page-pad">
      <Nav />

      {/* ── Hero — cinematic LA dusk, split layout ── */}
      <section className="on-dark relative flex min-h-[88vh] flex-col justify-center overflow-hidden md:min-h-[92vh]">
        <Image src="/la-hero.jpg" alt="Los Angeles skyline at dusk" fill priority sizes="100vw"
          className="hero-photo kenburns" />
        <div className="hero-scrim" />

        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-[1.2fr_1fr]">
          {/* Left — headline */}
          <div className="text-center lg:text-start">
            <p className="mb-6 flex items-center justify-center gap-3 text-[11px] font-medium uppercase tracking-[0.35em] text-white/55 lg:justify-start">
              {PLATFORM_NAME} <USFlag size={26} />
            </p>
            <h1 className="font-display max-w-2xl text-5xl leading-[1.05] tracking-tight md:text-7xl">
              {t("hero_title")}
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70 lg:mx-0">
              {t("hero_sub")}
            </p>
            <div className="mt-9 flex items-center justify-center gap-3 lg:justify-start">
              <Link href="/register" className="btn">{t("get_started")}</Link>
              <a href="#packages" className="btn-ghost !text-white"
                onClick={(e) => { e.preventDefault(); document.getElementById("packages")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                {t("view_packages")}
              </a>
            </div>
          </div>

          {/* Right — glass financial card */}
          {glance.length > 0 && (
            <div className="glass microprint relative hidden p-7 lg:block">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">{t("portfolio_glance")}</p>
                <Seal size={44} />
              </div>
              <div className="mt-6 space-y-0">
                {glance.map((p) => (
                  <div key={p.id} className="flex items-baseline justify-between border-b border-white/10 py-3.5 last:border-0">
                    <div>
                      <p className="font-display text-lg">{p.name}</p>
                      <p className="font-mono text-[10px] tracking-wider text-white/45">{p.duration_days}d · {t("incl_weekends")}</p>
                    </div>
                    <div className="text-end">
                      <p className="font-display text-xl text-accent">${Number(p.min_deposit).toLocaleString("en-US")}</p>
                      <p className="font-mono text-[10px] text-white/45">{t("daily")} {p.return_min_amount != null ? `>$${p.return_min_amount}` : "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.25em] text-white/35">
                34.0522° N · 118.2437° W
              </p>
            </div>
          )}
        </div>

        {/* fact strip — real facts only, no fake ticker */}
        <div className="relative border-t border-white/10 bg-black/25 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-2 px-4 py-3.5 text-[10px] uppercase tracking-[0.22em] text-white/50">
            <span>9 {t("packages")}</span>
            <span className="text-accent/70">·</span>
            <span>365 {t("days")} · {t("incl_weekends")}</span>
            <span className="text-accent/70">·</span>
            <span>Los Angeles, CA</span>
          </div>
        </div>
      </section>

      {/* ── 01 · Packages — ivory, editorial table ── */}
      <section id="packages" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
        <Reveal>
          <p className="sec-num mb-3 text-center">01 — {t("packages")}</p>
          <h2 className="font-display text-center text-3xl tracking-tight md:text-4xl">{t("packages")}</h2>
          <div className="rule-gold mt-5" />
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
                  <tr key={p.id} className="border-b border-border/60 transition last:border-0 hover:bg-ink/[0.03]">
                    <td className="px-5 py-4">
                      <span className="font-display text-base">{p.name}</span>
                      {p.description && <span className="mt-0.5 block text-xs text-muted">{p.description}</span>}
                    </td>
                    <td className="px-5 py-4 font-display text-lg text-accent">
                      ${Number(p.min_deposit).toLocaleString("en-US")}
                    </td>
                    <td className="px-5 py-4 text-ink/85">
                      {p.return_min_amount != null ? `> $${p.return_min_amount}` : "—"}
                    </td>
                    <td className="px-5 py-4 text-muted">{p.duration_days} {t("days")} · {t("incl_weekends")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!packages.length && <p className="px-5 py-8 text-center text-muted">{t("no_packages")}</p>}
          </div>
        </Reveal>
      </section>

      {/* ── Dark interlude — LA photo band + seal ── */}
      <section className="on-dark px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="photo-band relative h-64 md:h-80">
              <Image src="/la-skyline.jpg" alt="Los Angeles at night" fill sizes="(max-width:768px) 100vw, 1152px"
                className="kenburns object-cover" />
              <div className="absolute bottom-5 left-6 z-10">
                <p className="text-xs uppercase tracking-[0.3em] text-white/60">{PLATFORM_NAME}</p>
                <p className="font-display text-xl">{t("photo_band_caption")}</p>
              </div>
              <div className="absolute bottom-5 right-6 z-10 hidden md:block"><Seal size={64} /></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 02 · FAQ — ivory ── */}
      {faq.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-20">
          <Reveal>
            <p className="sec-num mb-3 text-center">02 — {t("faq_title")}</p>
            <h2 className="font-display text-center text-3xl tracking-tight">{t("faq_title")}</h2>
            <div className="rule-gold mt-5" />
          </Reveal>
          <div className="space-y-3">
            {faq.map((f, i) => (
              <Reveal key={i} delay={i * 80}>
                <button onClick={() => setOpenQ(openQ === i ? null : i)}
                  className="surface block w-full px-6 py-4 text-start transition hover:border-accent/40">
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

      {/* ── Footer — warm black, seal + coordinates ── */}
      <footer className="on-dark border-t border-border px-4 py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 text-center">
          <Seal size={72} />
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
            34.0522° N · 118.2437° W — Los Angeles
          </p>
          <div className="flex gap-5 text-xs text-muted">
            <Link href="/legal/terms" className="transition hover:text-white">{t("terms")}</Link>
            <Link href="/legal/privacy" className="transition hover:text-white">{t("privacy")}</Link>
          </div>
          <p className="text-[11px] text-white/35">{PLATFORM_NAME}</p>
        </div>
      </footer>
    </main>
  );
}
