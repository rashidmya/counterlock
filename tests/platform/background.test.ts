import { PROFILE_KEY } from "@/features/profile/storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setup(initiallyRunning = false, enabled = true) {
  function event() {
    let listener: (value: any) => void = () => {};
    return {
      addListener: vi.fn((callback) => {
        listener = callback;
      }),
      emit: (value: unknown) => listener(value),
    };
  }
  const game = (isRunning: boolean) => ({
    id: 244820,
    classId: 24482,
    isRunning,
  });
  const gameInfo = event();
  const hotkey = event();
  const launch = event();
  const info = event();
  const errors = event();
  let currentGame = game(initiallyRunning);
  let windowState = "normal";
  const windows = {
    obtainDeclaredWindow: vi.fn((name, callback) =>
      callback({ success: true, window: { id: name, stateEx: windowState } }),
    ),
    restore: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
  };
  const api = {
    windows,
    games: {
      getRunningGameInfo: vi.fn((callback) => callback(currentGame)),
      onGameInfoUpdated: gameInfo,
      events: {
        setRequiredFeatures: vi.fn((_features, callback) =>
          callback({ success: true }),
        ),
        getInfo: vi.fn((callback) => callback({ success: true, res: {} })),
        onInfoUpdates2: info,
        onNewEvents: event(),
        onError: errors,
      },
    },
    settings: { hotkeys: { onPressed: hotkey } },
    extensions: { onAppLaunchTriggered: launch },
  };
  vi.stubGlobal("overwolf", api);
  const preferences = new Map(
    enabled ? [["scout.overlay.recommended-build", "true"]] : [],
  );
  const storage = event();
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => preferences.get(key) ?? null,
    setItem,
  });
  vi.stubGlobal("window", {
    addEventListener: (_name: string, callback: any) =>
      storage.addListener(callback),
  });
  return {
    api,
    preferences,
    setItem,
    storage,
    windows,
    hotkey,
    launch,
    errors,
    info,
    setWindowState: (state: string) => {
      windowState = state;
    },
    changeGame: (running: boolean) => {
      currentGame = game(running);
      gameInfo.emit({ gameInfo: currentGame });
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("background window lifecycle", () => {
  it("preserves a manual reopen request during same-state game updates", async () => {
    const { api, windows, launch, changeGame } = setup(true);
    await import("@/platform/overwolf/background");
    let finishQuery: (info: unknown) => void = () => {};
    api.games.getRunningGameInfo.mockImplementation((callback) => {
      finishQuery = callback;
    });
    launch.emit({ origin: "dock" });
    changeGame(true);
    finishQuery({ id: 244820, classId: 24482, isRunning: true });
    expect(windows.restore.mock.calls).toEqual([
      ["in_game"],
      ["desktop"],
      ["desktop"],
    ]);
  });

  it("ignores an old startup query after a newer game-start event", async () => {
    const { api, windows, changeGame } = setup();
    let finishQuery: (info: unknown) => void = () => {};
    api.games.getRunningGameInfo.mockImplementation((callback) => {
      finishQuery = callback;
    });
    await import("@/platform/overwolf/background");
    changeGame(true);
    finishQuery(null);
    expect(windows.restore.mock.calls).toEqual([["in_game"]]);
  });

  it("does not restore an obsolete window when native callbacks arrive late", async () => {
    const { api, windows, changeGame } = setup(true);
    const pending: Array<(result: unknown) => void> = [];
    api.windows.obtainDeclaredWindow.mockImplementation((_name, callback) => {
      pending.push(callback);
    });
    await import("@/platform/overwolf/background");
    changeGame(false);
    pending[0]({ success: true, window: { id: "in_game", stateEx: "normal" } });
    pending[1]({ success: true, window: { id: "desktop", stateEx: "normal" } });
    expect(windows.restore.mock.calls).toEqual([["desktop"]]);
  });

  it("keeps desktop open while overlays follow game start and exit", async () => {
    const { windows, changeGame, api } = setup();
    await import("@/platform/overwolf/background");
    expect(windows.restore.mock.calls).toEqual([["desktop"]]);
    changeGame(true);
    expect(windows.close.mock.calls.some(([name]) => name === "desktop")).toBe(
      false,
    );
    expect(windows.restore).toHaveBeenLastCalledWith("in_game");
    expect(api.games.events.setRequiredFeatures).toHaveBeenCalledTimes(1);
    changeGame(true);
    expect(windows.restore).toHaveBeenCalledTimes(2);
    changeGame(false);
    expect(windows.close).toHaveBeenCalledWith("in_game", expect.any(Function));
    expect(windows.restore).toHaveBeenCalledTimes(2);
    expect(window.counterlockStore?.getSnapshot().phase).toBe("Init");
  });

  it("launches directly in game and toggles only the in-game window", async () => {
    const { windows, hotkey, changeGame, setWindowState } = setup(true);
    await import("@/platform/overwolf/background");
    expect(windows.restore.mock.calls).toEqual([["in_game"], ["desktop"]]);
    hotkey.emit({ name: "toggle_counterlock" });
    expect(windows.hide).toHaveBeenLastCalledWith("in_game");
    setWindowState("hidden");
    hotkey.emit({ name: "toggle_counterlock" });
    expect(windows.restore).toHaveBeenLastCalledWith("in_game");
    changeGame(false);
    const count = windows.obtainDeclaredWindow.mock.calls.length;
    hotkey.emit({ name: "toggle_counterlock" });
    expect(windows.obtainDeclaredWindow).toHaveBeenCalledTimes(count);
  });

  it("reopens the active window on manual launch without duplicate game-launch restores", async () => {
    const { windows, launch, changeGame } = setup();
    await import("@/platform/overwolf/background");
    launch.emit({ origin: "dock" });
    expect(windows.restore).toHaveBeenLastCalledWith("desktop");
    changeGame(true);
    launch.emit({ origin: "dock" });
    expect(windows.restore).toHaveBeenLastCalledWith("desktop");
    const count = windows.restore.mock.calls.length;
    launch.emit({ origin: "gamelaunchevent" });
    expect(windows.restore).toHaveBeenCalledTimes(count);
  });
});

it("records the detected account when the live store learns it", async () => {
  const { setItem, info } = setup(true);
  await import("@/platform/overwolf/background");
  expect(setItem).not.toHaveBeenCalled();
  info.emit({ info: { game_info: { steam_id: "76561198060265728" } } });
  expect(setItem).toHaveBeenCalledTimes(1);
  const [key, value] = setItem.mock.calls[0];
  expect(key).toBe(PROFILE_KEY);
  expect(JSON.parse(value)).toMatchObject({
    accountId: 100000000,
    source: "detected",
  });
});

it("starts with overlays off and applies each preference independently", async () => {
  const { windows, preferences, storage, changeGame } = setup(true, false);
  await import("@/platform/overwolf/background");
  expect(windows.restore.mock.calls).toEqual([["desktop"]]);
  preferences.set("scout.overlay.counter-items", "true");
  storage.emit({ key: "scout.overlay.counter-items" });
  expect(windows.restore.mock.calls).toEqual([
    ["desktop"],
    ["counter_overlay"],
  ]);
  expect(windows.close).toHaveBeenCalledWith("in_game", expect.any(Function));
  changeGame(false);
  expect(windows.close).toHaveBeenCalledWith(
    "counter_overlay",
    expect.any(Function),
  );
  expect(windows.close.mock.calls.some(([name]) => name === "desktop")).toBe(
    false,
  );
});
