/** Working time is Monday–Friday, 24 hours per day, in platform UTC. */
export function workingMilliseconds(start: number, end: number): number {
  if (end < start) return -workingMilliseconds(end, start);
  let total = 0;
  let current = start;
  while (current < end) {
    const date = new Date(current);
    const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
    const boundary = Math.min(next, end);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) total += boundary - current;
    current = boundary;
  }
  return total;
}
