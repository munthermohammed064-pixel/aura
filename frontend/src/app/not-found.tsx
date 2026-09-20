"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useT } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo size={64} />
      <h1 className="font-display mt-8 text-6xl tracking-tight">404</h1>
      <p className="mt-3 max-w-sm text-sm text-muted">{t("not_found")}</p>
      <Link href="/" className="btn mt-8">{t("back_home")}</Link>
    </main>
  );
}
