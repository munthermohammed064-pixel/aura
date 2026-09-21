"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Briefcase, ChevronDown, LayoutDashboard, LogOut, Package,
  TrendingUp, User, Users, Wallet,
} from "lucide-react";
import { api, clearTokens, getToken, PLATFORM_NAME } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { LangSelect } from "./LangSelect";
import { Logo } from "./Logo";
import { NotifyBell } from "./NotifyBell";
import { USFlag } from "./USFlag";

const PRIMARY = [
  ["dashboard", "/dashboard", LayoutDashboard],
  ["packages", "/packages", Package],
  ["wallet", "/wallet", Wallet],
] as const;

const MORE = [
  ["my_packages", "/my-packages", Briefcase],
  ["referrals", "/referrals", Users],
  ["markets", "/markets", TrendingUp],
] as const;

const LINKS = [...PRIMARY, ...MORE];
// Admin console lives on a per-deployment secret path — never a plain "/admin".
const ADMIN_HREF = `/nx/${process.env.NEXT_PUBLIC_ADMIN_PATH || ""}`;

export function Nav() {
  const { t } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const hasToken = !!getToken();
    setAuthed(hasToken);
    if (!hasToken) { setIsAdmin(false); return; }
    api<{ role: string }>("/auth/me").then((u) => setIsAdmin(u.role === "admin")).catch(() => {});
  }, [pathname]);

  useEffect(() => { setMenuOpen(false); setMoreOpen(false); }, [pathname]);

  const logout = () => {
    clearTokens();
    setAuthed(false);
    setIsAdmin(false);
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        {authed ? (
          <div className="flex shrink-0 cursor-default items-center gap-2.5">
            <Logo size={30} className="text-white" />
            <span className="font-display text-sm font-semibold tracking-[0.18em] uppercase">
              {PLATFORM_NAME}
            </span>
            <USFlag className="h-5 w-8 rounded-[3px]" />
          </div>
        ) : (
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <Logo size={30} className="text-white" />
            <span className="font-display text-sm font-semibold tracking-[0.18em] uppercase">
              {PLATFORM_NAME}
            </span>
            <USFlag className="h-5 w-8 rounded-[3px]" />
          </Link>
        )}

        {authed && (
          <div className="hidden flex-1 items-center gap-1 md:flex">
            {PRIMARY.map(([key, href, Icon]) => (
              <Link key={key} href={href}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                  pathname === href ? "bg-white/10 text-white" : "text-muted hover:text-white"
                }`}>
                <Icon size={13} strokeWidth={1.8} />
                {t(key)}
              </Link>
            ))}
            <div className="relative">
              <button onClick={() => setMoreOpen(!moreOpen)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                  MORE.some(([, h]) => pathname === h) ? "bg-white/10 text-white" : "text-muted hover:text-white"
                }`}>
                {t("more")}
                <ChevronDown size={12} strokeWidth={1.8} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
              </button>
              {moreOpen && (
                <div className="menu absolute end-0 top-full mt-2 w-44 overflow-hidden p-1.5">
                  {MORE.map(([key, href, Icon]) => (
                    <Link key={key} href={href}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition ${
                        pathname === href ? "bg-white/10 text-white" : "text-muted hover:text-white"
                      }`}>
                      <Icon size={13} strokeWidth={1.8} />
                      {t(key)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {!authed && <div className="flex-1" />}

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link href={ADMIN_HREF} className="hidden rounded-full border border-accent/40 px-3 py-1.5 text-xs text-accent md:block">
              {t("admin")}
            </Link>
          )}

          <LangSelect />

          {authed && <NotifyBell />}

          {authed && (
            <Link href="/profile" aria-label={t("profile")}
              className={`hidden h-9 w-9 place-items-center rounded-full border border-border bg-surface transition hover:border-white/20 md:grid ${
                pathname === "/profile" ? "text-accent border-accent/40" : ""
              }`}>
              <User size={15} strokeWidth={1.8} />
            </Link>
          )}

          {authed ? (
            <button onClick={logout} className="btn-ghost hidden px-3 py-1.5 text-xs md:block">
              {t("logout")}
            </button>
          ) : (
            <Link href="/login" className="btn px-4 py-1.5 text-xs">{t("get_started")}</Link>
          )}

          {authed && (
            <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface transition hover:border-white/20 md:hidden">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                {menuOpen
                  ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
              </svg>
            </button>
          )}
        </div>
      </nav>

      {menuOpen && authed && (
        <div className="border-t border-border bg-bg/95 px-4 pb-4 pt-2 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map(([key, href, Icon]) => (
              <Link key={key} href={href}
                className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm transition ${
                  pathname === href ? "bg-white/10 text-white" : "text-muted hover:text-white"
                }`}>
                <Icon size={15} strokeWidth={1.8} />
                {t(key)}
              </Link>
            ))}
            {isAdmin && (
              <Link href={ADMIN_HREF} className="rounded-xl px-4 py-2.5 text-sm text-accent">{t("admin")}</Link>
            )}
            <Link href="/profile" className="rounded-xl px-4 py-2.5 text-sm text-muted hover:text-white">{t("profile")}</Link>
            <button onClick={logout} className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-start text-sm text-muted hover:text-white">
              <LogOut size={15} strokeWidth={1.8} />
              {t("logout")}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
