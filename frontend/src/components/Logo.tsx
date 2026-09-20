export function Logo({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none"
      className={className} aria-label="Los Angeles">
      <circle cx="20" cy="20" r="18.6" stroke="currentColor" strokeOpacity=".35" strokeWidth="1" />
      {/* A glyph — twin peaks like the LA skyline */}
      <path d="M13.5 27.5 L20 12.5 L26.5 27.5" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M16.6 22.8 H23.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* gold horizon line — the L underneath */}
      <path d="M14.5 31 H25.5" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
