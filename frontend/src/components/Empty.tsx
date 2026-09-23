"use client";

import { LucideIcon } from "lucide-react";

// Minimal empty state — hairline icon ring + muted line, never a bare string.
export function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full border border-border text-muted">
        <Icon size={18} strokeWidth={1.5} />
      </span>
      <p className="text-xs text-muted">{text}</p>
    </div>
  );
}
