import type { HeroRow, HistoryFilter, HistoryMatch, Summary } from "../types";

const NORMAL = 1;
const STREET_BRAWL = 4;
const UNRANKED = 1;
const RANKED = 4;

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown) => (isNumber(value) ? value : 0);

export function parseHistory(rows: unknown): HistoryMatch[] {
  if (!Array.isArray(rows)) return [];
  const matches: HistoryMatch[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (
      !isNumber(r.match_id) ||
      !isNumber(r.hero_id) ||
      !isNumber(r.start_time) ||
      !isNumber(r.game_mode) ||
      !isNumber(r.match_mode) ||
      !isNumber(r.player_team) ||
      !isNumber(r.match_result)
    )
      continue;
    matches.push({
      matchId: r.match_id,
      heroId: r.hero_id,
      startTime: r.start_time,
      gameMode: r.game_mode,
      matchMode: r.match_mode,
      team: r.player_team,
      result: r.match_result,
      kills: count(r.player_kills),
      deaths: count(r.player_deaths),
      assists: count(r.player_assists),
      netWorth: count(r.net_worth),
      lastHits: count(r.last_hits),
      denies: count(r.denies),
      durationS: count(r.match_duration_s),
      heroLevel: count(r.hero_level),
      badge: count(r.ranked_display_badge),
    });
  }
  return matches.sort((a, b) => b.startTime - a.startTime);
}

export const isWin = (m: HistoryMatch) => m.result === m.team;

export function modeLabel(m: Pick<HistoryMatch, "gameMode" | "matchMode">) {
  if (m.gameMode === STREET_BRAWL) return "Street Brawl";
  if (m.gameMode === NORMAL && m.matchMode === RANKED) return "Ranked";
  if (m.gameMode === NORMAL && m.matchMode === UNRANKED) return "Normal";
  return "Other";
}

export function matchesFilter(m: HistoryMatch, filter: HistoryFilter) {
  if (filter === "all") return true;
  if (filter === "street_brawl") return m.gameMode === STREET_BRAWL;
  return modeLabel(m) === (filter === "ranked" ? "Ranked" : "Normal");
}

export const isSummaryMatch = (m: HistoryMatch) =>
  m.gameMode === NORMAL && (m.matchMode === UNRANKED || m.matchMode === RANKED);

export const kda = (kills: number, deaths: number, assists: number) =>
  (kills + assists) / Math.max(1, deaths);

export const soulsPerMin = (netWorth: number, durationS: number) =>
  durationS <= 0 ? 0 : netWorth / (durationS / 60);

const sum = (ms: HistoryMatch[], pick: (m: HistoryMatch) => number) =>
  ms.reduce((total, m) => total + pick(m), 0);
const average = (ms: HistoryMatch[], pick: (m: HistoryMatch) => number) =>
  ms.length ? sum(ms, pick) / ms.length : 0;
// Zero-duration matches carry no rate information, so they are left out of both sides.
const totalSoulsPerMin = (ms: HistoryMatch[]) => {
  const timed = ms.filter((m) => m.durationS > 0);
  return soulsPerMin(
    sum(timed, (m) => m.netWorth),
    sum(timed, (m) => m.durationS),
  );
};

export function summarize(ms: HistoryMatch[]): Summary {
  const wins = ms.filter(isWin).length;
  return {
    games: ms.length,
    wins,
    winRate: ms.length ? wins / ms.length : null,
    kda: kda(
      sum(ms, (m) => m.kills),
      sum(ms, (m) => m.deaths),
      sum(ms, (m) => m.assists),
    ),
    soulsPerMin: totalSoulsPerMin(ms),
    avgKills: average(ms, (m) => m.kills),
    avgDeaths: average(ms, (m) => m.deaths),
    avgAssists: average(ms, (m) => m.assists),
    avgLastHits: average(ms, (m) => m.lastHits),
  };
}

export function rankedSummary(ms: HistoryMatch[]) {
  const ranked = ms.filter(
    (m) => m.gameMode === NORMAL && m.matchMode === RANKED,
  );
  return {
    games: ranked.length,
    winRate: ranked.length ? ranked.filter(isWin).length / ranked.length : null,
  };
}

export function heroBreakdown(ms: HistoryMatch[]): HeroRow[] {
  const groups = new Map<number, HistoryMatch[]>();
  for (const m of ms)
    groups.set(m.heroId, [...(groups.get(m.heroId) ?? []), m]);
  return [...groups.entries()]
    .map(([heroId, games]) => {
      const s = summarize(games);
      return {
        heroId,
        games: s.games,
        wins: s.wins,
        losses: s.games - s.wins,
        winRate: s.wins / s.games,
        kills: s.avgKills,
        deaths: s.avgDeaths,
        assists: s.avgAssists,
        kda: s.kda,
        soulsPerMin: s.soulsPerMin,
        lastHits: s.avgLastHits,
        denies: average(games, (m) => m.denies),
        lastPlayed: Math.max(...games.map((m) => m.startTime)),
      };
    })
    .sort((a, b) => b.games - a.games || b.lastPlayed - a.lastPlayed);
}

export const topHeroes = (ms: HistoryMatch[], n = 3) =>
  heroBreakdown(ms).slice(0, n);
