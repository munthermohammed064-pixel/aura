import { ReactNode } from "react";

export function GlassCard({ children, className = "", hover = false, glass = false }: {
  children: ReactNode; className?: string; hover?: boolean; glass?: boolean;
}) {
  return (
    <div className={`${glass ? "glass" : "surface"} p-6 ${hover ? "glass-hover" : ""} ${className}`}>{children}</div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return <p className="disclaimer">{children}</p>;
}
