import type { MatchState, Player } from "../types";
import { catalog } from "@/shared/catalog";
import { heroName, enemyPlayers } from "./hero-identity";

const STEAM_BASE = 76561197960265728n;
export function accountId(value: unknown): number | null {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  const match = /^\[U:1:(\d+)\]$/.exec(text);
  if (!/^\d+$/.test(match?.[1] ?? text)) return null;
  let id = BigInt(match?.[1] ?? text);
  if (id >= STEAM_BASE) id -= STEAM_BASE;
  return id > 0n && id <= 4294967295n ? Number(id) : null;
}

export function decode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    // Preserve numeric SteamID64 values before JSON.parse loses precision.
    return JSON.parse(
      value.replace(/("steam_id"\s*:\s*)(\d{16,20})(?=\s*[,}])/g, '$1"$2"'),
    );
  } catch {
    return value;
  }
}
function object(value: unknown): Record<string, unknown> {
  const decoded = decode(value);
  return decoded && typeof decoded === "object" && !Array.isArray(decoded)
    ? (decoded as Record<string, unknown>)
    : {};
}
function integer(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
export function initialState(mode: MatchState["mode"] = "live"): MatchState {
  return {
    mode,
    status: "Waiting for Deadlock",
    phase: "Init",
    matchId: null,
    gameMode: "normal",
    localAccountId: null,
    clock: "—",
    players: [],
    stats: {},
    error: null,
    loading: false,
  };
}
export function applyInfo(state: MatchState, payload: unknown): MatchState {
  const root = object(payload);
  const info = object(root.info ?? root.res ?? root);
  let game = object(info.game_info);
  let match = object(info.match_info);
  if (typeof root.key === "string") {
    const entry = { [root.key.trim()]: root.value ?? root.data };
    if (root.category === "game_info") game = entry;
    if (root.category === "match_info") match = entry;
  }
  // Some GEP versions include trailing spaces in keys.
  game = Object.fromEntries(
    Object.entries(game).map(([k, v]) => [k.trim(), v]),
  );
  match = Object.fromEntries(
    Object.entries(match).map(([k, v]) => [k.trim(), v]),
  );
  const newId = match.match_id == null ? null : String(match.match_id);
  const phase = typeof game.phase === "string" ? game.phase : state.phase;
  const newLobby =
    ["Init", "WaitingForPlayersToJoin"].includes(phase) &&
    !["Init", "WaitingForPlayersToJoin"].includes(state.phase);
  const newMatch = newId && state.matchId && newId !== state.matchId;
  let next =
    newLobby || newMatch
      ? {
          ...initialState(),
          status: state.status,
          localAccountId: state.localAccountId,
          gameMode: state.gameMode,
        }
      : { ...state };
  next.phase = phase;
  if (Object.hasOwn(match, "match_clock") && match.match_clock === null)
    next.clock = "—";
  if (
    typeof match.match_clock === "string" &&
    /^-?\d{1,4}:[0-5]\d$/.test(match.match_clock)
  )
    next.clock = match.match_clock;
  if (newId) next.matchId = newId;
  const mode = object(game.game_mode).game_mode;
  if (typeof mode === "string") {
    const newMode = /street.?brawl/i.test(mode) ? "street_brawl" : "normal";
    if (newMode !== next.gameMode) next.stats = {};
    next.gameMode = newMode;
  }
  const roster = new Map(next.players.map((p) => [p.slot, p]));
  for (const [key, value] of Object.entries(match)) {
    if (!/^roster_\d+$/.test(key)) continue;
    if (value === null || value === "" || value === "null") {
      roster.delete(key);
      continue;
    }
    const row = object(value);
    const previous = roster.get(key);
    if (!("hero_id" in row) && !previous) continue;
    if (integer(row.hero_id, previous?.heroId) === 0) {
      roster.delete(key);
      continue;
    }
    const local =
      row.is_local == null
        ? (previous?.local ?? false)
        : row.is_local === true || row.is_local === "true";
    roster.set(key, {
      slot: key,
      name: String(row.player_name ?? previous?.name ?? "Unknown player"),
      heroId: integer(row.hero_id, previous?.heroId),
      heroName: heroName(
        integer(row.hero_id, previous?.heroId),
        catalog.heroes,
        row.hero_name,
      ),
      team: integer(row.team_id, previous?.team),
      local,
      accountId:
        row.steam_id === undefined
          ? (previous?.accountId ?? null)
          : accountId(row.steam_id),
      kills: integer(row.kills, previous?.kills),
      deaths: integer(row.deaths, previous?.deaths),
      assists: integer(row.assists ?? row.assist, previous?.assists),
      items: previous?.items ?? [],
      itemsKnown: previous?.itemsKnown ?? false,
    });
  }
  if ("steam_id" in game) next.localAccountId = accountId(game.steam_id);
  const localId = next.localAccountId;
  if (localId)
    for (const p of roster.values())
      if (p.local) roster.set(p.slot, { ...p, accountId: localId });
  for (const [key, value] of Object.entries(match)) {
    if (!/^items_\d+$/.test(key)) continue;
    const row = object(value);
    const id = accountId(row.steam_id);
    const slot = key.replace("items_", "roster_");
    const player = id
      ? [...roster.values()].find((p) => p.accountId === id)
      : roster.get(slot);
    if (player && Array.isArray(row.items))
      roster.set(player.slot, {
        ...player,
        itemsKnown: true,
        items: row.items
          .map((item) => integer(object(item).id))
          .filter(Boolean),
      });
  }
  next.players = [...roster.values()].sort(
    (a, b) => Number(a.slot.split("_")[1]) - Number(b.slot.split("_")[1]),
  );
  return next;
}

export function splitTeams(players: Player[]) {
  const reportedTeam = players.find((p) => p.local)?.team;
  const team =
    reportedTeam === 2 || reportedTeam === 3 ? reportedTeam : undefined;
  return {
    team,
    allies: team == null ? [] : players.filter((p) => p.team === team),
    enemies: enemyPlayers(players),
  };
}
