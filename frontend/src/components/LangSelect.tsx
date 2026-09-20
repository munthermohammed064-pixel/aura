"use client";

import { useEffect, useRef, useState } from "react";
import { LANGS, useT } from "@/lib/i18n";

export function LangSelect() {
  const { lang, setLang } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Language"
        className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs transition hover:border-white/20">
        <span>{current.flag}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute end-0 top-11 z-50 w-44">
          <div className="glass p-1.5 shadow-2xl">
            {LANGS.map((l) => (
              <button key={l.code}
                onClick={() => { setLang(l.code); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-xs transition ${
                  l.code === lang ? "bg-accent/15 text-accent" : "hover:bg-white/5"
                }`}>
                <span className="w-6 text-[10px] text-muted">{l.flag}</span>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
