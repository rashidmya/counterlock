export function heroName(
  id: number,
  heroes: { id: number; name: string }[],
  reported?: unknown,
): string {
  const known = heroes.find((hero) => hero.id === id)?.name;
  if (known) return known;
  if (
    typeof reported === "string" &&
    reported.trim() &&
    reported !== "Unknown hero"
  )
    return reported;
  return id > 0 ? `Hero #${id}` : "Hero not detected";
}
export function enemyPlayers<T extends { team: number; local?: boolean }>(
  players: T[],
): T[] {
  const team = players.find((player) => player.local)?.team;
  return team === 2 || team === 3
    ? players.filter((player) => player.team === (team === 2 ? 3 : 2))
    : [];
}
