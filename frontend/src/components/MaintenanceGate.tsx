"use client";

import { useEffect, useState, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Logo } from "@/components/Logo";

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { t } = useT();
  const pathname = usePathname();
  const [down, setDown] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api<{ maintenance_mode: boolean }>("/config", { auth: false })
      .then((c) => setDown(c.maintenance_mode))
      .catch(() => {});
    if (getToken()) {
      api<{ role: string }>("/auth/me")
        .then((u) => setIsAdmin(["admin", "owner"].includes(u.role)))
        .catch(() => {});
    } else {
      setIsAdmin(false);
    }
  }, [pathname]);

  if (down && !isAdmin && !["/login", "/register"].includes(pathname)) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <Logo size={64} />
        <h1 className="font-display mt-8 text-3xl tracking-tight">{t("maintenance_t")}</h1>
        <p className="mt-3 max-w-sm text-sm text-muted">{t("maintenance_d")}</p>
      </main>
    );
  }
  return <>{children}</>;
}
