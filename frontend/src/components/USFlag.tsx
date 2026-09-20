export function USFlag({ size = 20, className = "" }: { size?: number; className?: string }) {
  // Canvas: 40×24.8 units. 13 stripes, canton 40% wide × 7 stripes, 9 star rows (6/5 alternating).
  const h = size * 0.62;
  const stripe = 24.8 / 13;
  const cantonH = stripe * 7;
  const stars: { cx: number; cy: number }[] = [];
  for (let r = 0; r < 9; r++) {
    const cols = r % 2 === 0 ? 6 : 5;
    for (let c = 0; c < cols; c++) {
      stars.push({
        cx: (r % 2 === 0 ? 1.6 : 2.9) + c * 2.6,
        cy: 1.5 + r * (cantonH - 3) / 8,
      });
    }
  }
  return (
    <svg width={size} height={h} viewBox="0 0 40 24.8" aria-label="USA"
      className={`inline-block shrink-0 overflow-hidden rounded-[3px] ring-1 ring-white/10 ${className}`}>
      <rect width="40" height="24.8" fill="#fff" />
      {Array.from({ length: 7 }).map((_, i) => (
        <rect key={i} y={i * stripe * 2} width="40" height={stripe} fill="#b31942" />
      ))}
      <rect width="16" height={cantonH} fill="#0a3161" />
      {stars.map((s, i) => <circle key={i} cx={s.cx} cy={s.cy} r="0.55" fill="#fff" />)}
    </svg>
  );
}
