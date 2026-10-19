export function timeAgo(timestampMs: number, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - timestampMs) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(days / 365)}y ago`;
}

export function duration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export const compactSouls = (souls: number) =>
  souls >= 1000 ? `${(souls / 1000).toFixed(1)}k` : String(Math.round(souls));
