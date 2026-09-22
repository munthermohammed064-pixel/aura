"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { USFlag } from "./USFlag";

// Frosted-glass flag field behind the user account area. Portaled to <body>
// (the sticky header creates a containing block that would trap position:fixed)
// and layered at -z-10: above the page background, under the grain + content.
export function FlagBackdrop() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-44 end-[-8rem] -rotate-6 opacity-[0.10] blur-[1.5px] md:end-[-5rem]">
        <USFlag size={980} className="rounded-3xl" />
      </div>
      <div className="absolute -bottom-60 start-[-10rem] rotate-[8deg] opacity-[0.06] blur-[2.5px]">
        <USFlag size={760} className="rounded-3xl" />
      </div>
      {/* glass veil — fades edges so text keeps full contrast */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(var(--bg) / .55) 0%, transparent 32%, transparent 68%, rgb(var(--bg) / .6) 100%)",
        }}
      />
    </div>,
    document.body,
  );
}
