/** Match clock, e.g. 6:32 or 36:04. */
export function clock(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 59.9K, 906, 12.5 (fractions only below 100). */
export function compact(value: number) {
  const size = Math.abs(value);
  if (size < 0.05) return "0";
  const sign = value < 0 ? "−" : "";
  if (size >= 999.5) return `${sign}${(size / 1000).toFixed(1)}K`;
  if (size >= 99.95 || Number.isInteger(size))
    return `${sign}${Math.round(size)}`;
  return `${sign}${size.toFixed(1)}`;
}

/** "12%": a 0–1 share or change as a whole percent, without its sign. */
export const percent = (share: number) =>
  `${Math.round(Math.abs(share) * 100)}%`;
