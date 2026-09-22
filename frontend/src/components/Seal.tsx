// Banknote-style circular seal — "NEXORA · LOS ANGELES".
// Decorative only; inherits accent color via currentColor.
export function Seal({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`text-accent ${className}`} aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeOpacity=".55" strokeWidth="1" />
      <circle cx="50" cy="50" r="44.5" fill="none" stroke="currentColor" strokeOpacity=".3" strokeWidth=".6" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth=".6" />
      <defs>
        <path id="seal-arc" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0" />
      </defs>
      <text fontSize="7" letterSpacing="2.4" fill="currentColor" fillOpacity=".75"
        fontFamily="ui-monospace, Menlo, monospace">
        <textPath href="#seal-arc">NEXORA · LOS ANGELES ·</textPath>
      </text>
      {/* A-mark */}
      <path d="M41 62 L50 40 L59 62" stroke="currentColor" strokeWidth="2" fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M44.6 55.5 H55.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M43 66 H57" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
