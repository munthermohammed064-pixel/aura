"use client";

import { Star } from "lucide-react";

/** 4-star standing display — gold = active, dim outline = deducted by admin. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1" dir="ltr">
      {[0, 1, 2, 3].map((i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={1.6}
          className={i < value ? "fill-accent text-accent drop-shadow-[0_0_6px_rgba(201,169,98,.45)]" : "text-ink/20"}
        />
      ))}
    </span>
  );
}
