"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, Briefcase, ChevronDown, History, LayoutDashboard, LogOut, Package,
  Ticket, TrendingUp, User, Users, Wallet,
} from "lucide-react";
import { api, clearTokens, getToken, PLATFORM_NAME } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { FlagBackdrop } from "./FlagBackdrop";
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
  ["account_activity", "/activity", History],
  ["markets", "/markets", TrendingUp],
] as const;

const LINKS = [...PRIMARY, ...MORE];

// Thumb-reach bottom bar — the five places users actually live.
const BOTTOM = [
  ["dashboard", "/dashboard", LayoutDashboard],
  ["packages", "/packages", Package],
  ["nav_code", "/dashboard#redeem", Ticket],
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

  // Same-page hash links don't always scroll via the router — force it.
  const goCode = (e: React.MouseEvent) => {
    if (pathname === "/dashboard") {
      e.preventDefault();
      document.getElementById("redeem")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

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
        <nav className="mx-auto flex h-20 max-w-6xl items-center gap-4 px-4 md:px-6">
          {authed ? (
            <div className="flex shrink-0 cursor-default items-center gap-3">
              <Logo size={36} className="text-ink" />
              <span className="hidden font-display text-base font-semibold tracking-[0.18em] uppercase min-[430px]:inline">
                {PLATFORM_NAME}
              </span>
              <USFlag className="h-6 w-10 rounded-[3px]" />
            </div>
          ) : (
            <Link href="/" className="flex shrink-0 items-center gap-3">
              <Logo size={36} className="text-ink" />
              <span className="hidden font-display text-base font-semibold tracking-[0.18em] uppercase min-[430px]:inline">
                {PLATFORM_NAME}
              </span>
              <USFlag className="h-6 w-10 rounded-[3px]" />
            </Link>
          )}

          {authed && (
            <div className="hidden flex-1 items-center gap-1 md:flex">
              {PRIMARY.map(([key, href, Icon]) => (
                <Link key={key} href={href}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition ${
                    pathname === href ? "bg-ink/10 text-ink" : "text-muted hover:text-ink"
                  }`}>
                  <Icon size={15} strokeWidth={1.8} />
                  {t(key)}
                </Link>
              ))}
              <div className="relative">
                <button onClick={() => setMoreOpen(!moreOpen)}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition ${
                    MORE.some(([, h]) => pathname === h) ? "bg-ink/10 text-ink" : "text-muted hover:text-ink"
                  }`}>
                  {t("more")}
                  <ChevronDown size={13} strokeWidth={1.8} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
                </button>
                {moreOpen && (
                  <div className="menu absolute end-0 top-full mt-2 w-48 overflow-hidden p-1.5">
                    {MORE.map(([key, href, Icon]) => (
                      <Link key={key} href={href}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                          pathname === href ? "bg-ink/10 text-ink" : "text-muted hover:text-ink"
                        }`}>
                        <Icon size={14} strokeWidth={1.8} />
                        {t(key)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <Link href="/dashboard#redeem" onClick={goCode}
                className="ms-1 flex items-center gap-2 rounded-full border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20">
                <Ticket size={15} strokeWidth={1.8} />
                {t("nav_code")}
              </Link>
            </div>
          )}
          {!authed && <div className="flex-1" />}

          <div className="flex items-center gap-1.5 md:gap-2">
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
              <Link href="/dashboard#redeem" onClick={goCode} aria-label={t("nav_code")}
                className="grid h-10 w-10 place-items-center rounded-full border border-accent/50 bg-accent/10 text-accent transition hover:bg-accent/20 md:hidden">
                <Ticket size={17} strokeWidth={1.8} />
              </Link>
            )}
            {authed && (
              <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface transition hover:border-ink/20 md:hidden">
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
          <div className="max-h-[70dvh] overflow-y-auto border-t border-border bg-bg/95 px-4 pb-4 pt-2 backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-1">
              <Link href="/dashboard#redeem" onClick={goCode}
                className="flex items-center gap-2.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent transition">
                <Ticket size={15} strokeWidth={1.8} />
                {t("nav_code")}
              </Link>
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
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-6">
            {BOTTOM.map(([key, href, Icon]) => {
              const active = pathname === href;
              return (
                <Link key={key} href={href}
                  onClick={key === "nav_code" ? goCode : undefined}
                  className={`relative flex flex-col items-center gap-1 py-3 text-[10px] font-medium uppercase tracking-wider transition ${
                    active ? "text-accent" : "text-muted"
                  }`}>
                  {active && <span className="absolute top-1 h-1 w-1 rounded-full bg-accent" />}
                  <Icon size={19} strokeWidth={active ? 2 : 1.6} />
                  {t(key)}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Frosted flag field — user account pages only, never the admin console */}
      {authed && !pathname.startsWith("/nx") && <FlagBackdrop />}
    </>
  );
}
