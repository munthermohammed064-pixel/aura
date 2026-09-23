"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";
import { LangSelect } from "@/components/LangSelect";
import { Logo } from "@/components/Logo";
import { PLATFORM_NAME } from "@/lib/api";
import { useT } from "@/lib/i18n";

export function AuthShell({ children, title, sub }: {
  children: ReactNode; title: string; sub?: string;
}) {
  const { t } = useT();
  return (
    <main className="on-dark flex min-h-svh">
      {/* Left — cinematic LA panel */}
      <div className="relative hidden w-[45%] overflow-hidden lg:block">
        <Image src="/la-hero.jpg" alt="Los Angeles at night" fill priority sizes="45vw"
          className="hero-photo kenburns" />
        <div className="hero-scrim" />
        <div className="absolute inset-0 flex flex-col justify-between p-10">
          <Link href="/" className="flex items-center gap-3">
            <Logo size={34} />
            <span className="font-display text-xl tracking-tight">{PLATFORM_NAME}</span>
          </Link>
          <div>
            <div className="rule-gold !mx-0 mb-6" />
            <p className="font-display max-w-sm text-3xl leading-snug tracking-tight">
              {t("hero_title")}
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
              {t("hero_sub")}
            </p>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="absolute end-6 top-6"><LangSelect /></div>
        <Link href="/" className="mb-10 flex items-center gap-3 lg:hidden">
          <Logo size={30} />
          <span className="font-display text-lg">{PLATFORM_NAME}</span>
        </Link>
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl tracking-tight">{title}</h1>
          {sub && <p className="mt-2 text-sm text-muted">{sub}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
