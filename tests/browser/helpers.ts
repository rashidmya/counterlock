import type { Page } from "@playwright/test";
import type { MatchState } from "../../src/features/match/types";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

export const item = catalog.items[0];

export function matchPlayers(itemId: number = item.id) {
  const player = {
    slot: "player_0",
    name: "Local player",
    heroId: 7,
    heroName: "Haze",
    team: 2,
    local: true,
    accountId: null,
    kills: 1,
    deaths: 2,
    assists: 3,
    heroDamage: 1200,
    objectiveDamage: 300,
    healing: 0,
    souls: 10000,
    level: 8,
    items: [itemId],
    itemsKnown: true,
  };
  return [
    player,
    {
      ...player,
      slot: "player_1",
      heroId: 13,
      heroName: "Haze",
      name: "Enemy",
      team: 3,
      local: false,
      items: [],
    },
  ];
}

export async function nativeWindow(
  page: Page,
  name: string,
  gameMode = "normal",
  options: {
    running?: boolean;
    players?: boolean;
    state?: Partial<MatchState>;
  } = {},
) {
  const { running = true, players = true } = options;
  await page.addInitScript(
    ({ name, gameMode, running, roster, initial }) => {
      const listeners = new Set<() => void>();
      const nativeCalls = { moves: [] as unknown[][], drags: [] as string[] };
      const position = { left: 123, top: 45 };
      let state = {
        mode: "live",
        status: "Connected",
        phase: "GameInProgress",
        matchId: "42",
        gameMode,
        localAccountId: null,
        clock: "12:34",
        paused: false,
        players: roster,
        stats: {},
        error: null,
        loading: false,
        ...initial,
      };
      const bridge = {
        getSnapshot: () => state,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        refresh: () => {},
      };
      Object.assign(window, {
        nativeCalls,
        updateMatch: (patch: object) => {
          state = { ...state, ...patch };
          listeners.forEach((listener) => listener());
        },
        overwolf: {
          windows: {
            getMainWindow: () => ({ counterlockStore: bridge }),
            getCurrentWindow: (callback: (value: unknown) => void) =>
              callback({
                success: true,
                window: { id: name, name, ...position },
              }),
            changePosition: (
              id: string,
              left: number,
              top: number,
              callback?: (r: unknown) => void,
            ) => {
              nativeCalls.moves.push([id, left, top]);
              Object.assign(position, { left, top });
              callback?.({ success: true });
            },
            dragMove: (id: string, callback?: (r: unknown) => void) => {
              nativeCalls.drags.push(id);
              Object.assign(position, { left: 456, top: 78 });
              callback?.({ success: true });
            },
            hide: () => {},
          },
          games: {
            getRunningGameInfo: (callback: (value: unknown) => void) =>
              callback({ classId: 24482, isRunning: running }),
            onGameInfoUpdated: {
              addListener: () => {},
              removeListener: () => {},
            },
          },
          settings: {
            hotkeys: {
              get: (callback: (value: unknown) => void) =>
                callback({
                  success: true,
                  globals: [{ name: "toggle_counterlock", binding: "Alt + S" }],
                }),
            },
          },
        },
      });
      localStorage.setItem("scout.overlay.opacity", "75");
      for (const id of [
        "hero-damage",
        "objective-damage",
        "healing",
        "you-vs-average",
        "spawn-timers",
      ])
        localStorage.setItem(`scout.overlay.${id}`, "true");
    },
    {
      name,
      gameMode,
      running,
      roster: players ? matchPlayers() : [],
      initial: options.state ?? {},
    },
  );
}

export function updateMatch(page: Page, patch: object) {
  return page.evaluate(
    (patch) =>
      (
        window as unknown as { updateMatch: (patch: object) => void }
      ).updateMatch(patch),
    patch,
  );
}
