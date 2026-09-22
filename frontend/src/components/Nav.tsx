"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, Briefcase, ChevronDown, LayoutDashboard, LogOut, Package,
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

// Thumb-reach bottom bar — the five places users actually live.
const BOTTOM = [
  ["dashboard", "/dashboard", LayoutDashboard],
  ["packages", "/packages", Package],
  ["wallet", "/wallet", Wallet],
  ["activity", "/my-packages", Activity],
  ["account", "/profile", User],
] as const;

export function Nav() {
  const { t } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminHref, setAdminHref] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const hasToken = !!getToken();
    setAuthed(hasToken);
    if (!hasToken) { setIsAdmin(false); setAdminHref(""); return; }
    api<{ role: string }>("/auth/me").then((u) => {
      const staff = ["admin", "owner"].includes(u.role);
      setIsAdmin(staff);
      const pk = localStorage.getItem("nx_panel");
      if (staff && pk) setAdminHref(`/nx/${pk}`);
    }).catch(() => {});
  }, [pathname]);

  useEffect(() => { setMenuOpen(false); setMoreOpen(false); }, [pathname]);

  const logout = () => {
    clearTokens();
    setAuthed(false);
    setIsAdmin(false);
    setAdminHref("");
    router.push("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          {authed ? (
            <div className="flex shrink-0 cursor-default items-center gap-2.5">
              <Logo size={30} className="text-ink" />
              <span className="font-display text-sm font-semibold tracking-[0.18em] uppercase">
                {PLATFORM_NAME}
              </span>
              <USFlag className="h-5 w-8 rounded-[3px]" />
            </div>
          ) : (
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <Logo size={30} className="text-ink" />
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
                    pathname === href ? "bg-ink/10 text-ink" : "text-muted hover:text-ink"
                  }`}>
                  <Icon size={13} strokeWidth={1.8} />
                  {t(key)}
                </Link>
              ))}
              <div className="relative">
                <button onClick={() => setMoreOpen(!moreOpen)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                    MORE.some(([, h]) => pathname === h) ? "bg-ink/10 text-ink" : "text-muted hover:text-ink"
                  }`}>
                  {t("more")}
                  <ChevronDown size={12} strokeWidth={1.8} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                </button>
                {moreOpen && (
                  <div className="menu absolute end-0 top-full mt-2 w-44 overflow-hidden p-1.5">
                    {MORE.map(([key, href, Icon]) => (
                      <Link key={key} href={href}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition ${
                          pathname === href ? "bg-ink/10 text-ink" : "text-muted hover:text-ink"
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
            {isAdmin && adminHref && (
              <Link href={adminHref} className="hidden rounded-full border border-accent/40 px-3 py-1.5 text-xs text-accent md:block">
                {t("admin")}
              </Link>
            )}

            <LangSelect />

            {authed && <NotifyBell />}

            {authed && !isAdmin && (
              <Link href="/profile" aria-label={t("profile")}
                className={`hidden h-9 w-9 place-items-center rounded-full border border-border bg-surface transition hover:border-ink/20 md:grid ${
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
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface transition hover:border-ink/20 md:hidden">
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
              {MORE.map(([key, href, Icon]) => (
                <Link key={key} href={href}
                  className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm transition ${
                    pathname === href ? "bg-ink/10 text-ink" : "text-muted hover:text-ink"
                  }`}>
                  <Icon size={15} strokeWidth={1.8} />
                  {t(key)}
                </Link>
              ))}
              {isAdmin && adminHref && (
                <Link href={adminHref} className="rounded-xl px-4 py-2.5 text-sm text-accent">{t("admin")}</Link>
              )}
              <button onClick={logout} className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-start text-sm text-muted hover:text-ink">
                <LogOut size={15} strokeWidth={1.8} />
                {t("logout")}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Mobile bottom bar — thumb-reach nav for the five core screens */}
      {authed && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/85 backdrop-blur-xl md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5">
            {BOTTOM.map(([key, href, Icon]) => {
              const active = pathname === href;
              return (
                <Link key={key} href={href}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[9px] font-medium uppercase tracking-wider transition ${
                    active ? "text-accent" : "text-muted"
                  }`}>
                  <Icon size={17} strokeWidth={active ? 2 : 1.6} />
                  {t(key)}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
