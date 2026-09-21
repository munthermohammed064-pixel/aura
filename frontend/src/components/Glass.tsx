import { ReactNode } from "react";

export function GlassCard({ children, className = "", hover = false, glass = false, id }: {
  children: ReactNode; className?: string; hover?: boolean; glass?: boolean; id?: string;
}) {
  return (
    <div id={id} className={`${glass ? "glass" : "surface"} p-6 ${hover ? "glass-hover" : ""} ${className}`}>{children}</div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return <p className="disclaimer">{children}</p>;
}
