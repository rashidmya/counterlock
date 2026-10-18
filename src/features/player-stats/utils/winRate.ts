export function winRate(wins: number, matches: number): number | null {
  return Number.isFinite(wins) &&
    Number.isFinite(matches) &&
    matches > 0 &&
    wins >= 0 &&
    wins <= matches
    ? (wins / matches) * 100
    : null;
}
