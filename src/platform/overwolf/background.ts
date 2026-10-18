import { isDeadlock, type GameInfo } from "./game";
import { overlayPreferenceKey } from "@/features/overlay/preferences";
import { LiveStore } from "@/features/match/store/LiveStore";
import {
  kGamesFeatures,
  kHotkeys,
  kWindowNames,
  type ForegroundWindowName,
} from "./constants";

const overlayWindows = [
  [kWindowNames.inGame, "recommended-build"],
  [kWindowNames.counters, "counter-items"],
] as const;

const store = new LiveStore();
window.counterlockStore = store;
let running = false;
let initialized = false;
let gameRevision = 0;
const windowRevisions = { desktop: 0, in_game: 0, counter_overlay: 0 };
let registration = 0;
let retry: ReturnType<typeof setTimeout> | undefined;

function showWindow(name: ForegroundWindowName, toggle = false) {
  const token = ++windowRevisions[name];
  overwolf.windows.obtainDeclaredWindow(name, (result) => {
    if (token !== windowRevisions[name]) return;
    if (!result.success) {
      store.patch({ error: `Unable to open the ${name} window.` });
      return;
    }
    if (toggle && ["normal", "maximized"].includes(result.window.stateEx))
      overwolf.windows.hide(result.window.id);
    else overwolf.windows.restore(result.window.id);
  });
}
function registerFeatures(attempt = 0) {
  const token = ++registration;
  overwolf.games.events.setRequiredFeatures(kGamesFeatures, (result) => {
    if (token !== registration || !running) return;
    if (result.success) {
      store.patch({ status: "Connected to Deadlock", error: null });
      overwolf.games.events.getInfo((info) => {
        if (info.success && token === registration) store.ingest(info.res);
      });
    } else {
      store.patch({
        status: "Waiting for game events",
        error: result.error || "Game events are unavailable.",
      });
      if (attempt < 5)
        retry = setTimeout(
          () => registerFeatures(attempt + 1),
          Math.min(30_000, 2000 * 2 ** attempt),
        );
    }
  });
}
function onGame(info: GameInfo | null | undefined) {
  const next = isDeadlock(info);
  if (initialized && next === running) return false;
  gameRevision++;
  initialized = true;
  running = next;
  clearTimeout(retry);
  if (running) {
    registerFeatures();
    syncOverlay();
  } else {
    registration++;
    store.reset();
    syncOverlay();
  }
  return true;
}
function openCurrentWindow() {
  const revision = gameRevision;
  overwolf.games.getRunningGameInfo((info) => {
    if (revision !== gameRevision) return;
    onGame(info);
    showWindow(kWindowNames.desktop);
  });
}
overwolf.games.events.onInfoUpdates2.addListener((update) => {
  if (running) store.ingest(update);
});
overwolf.games.events.onNewEvents.addListener(({ events }) => {
  if (!running) return;
  for (const event of events) {
    if (event.name === "match_end") store.patch({ phase: "PostGame" });
    if (event.name === "match_start") {
      store.patch({ phase: "GameInProgress", clock: "00:00" });
      store.refresh();
    }
    if (event.name === "match_clock" && typeof event.data === "string")
      store.patch({ clock: event.data });
  }
});
overwolf.games.events.onError.addListener(() => {
  if (running)
    store.patch({
      error:
        "Overwolf game events are unavailable. Check the provider status or restart Deadlock.",
    });
});
overwolf.games.onGameInfoUpdated.addListener((event) => onGame(event.gameInfo));
overwolf.settings.hotkeys.onPressed.addListener((event) => {
  if (event.name === kHotkeys.toggle && running && overlayEnabled())
    for (const [name, key] of overlayWindows)
      if (localStorage.getItem(overlayPreferenceKey(key)) === "true")
        showWindow(name, true);
});
overwolf.extensions.onAppLaunchTriggered.addListener((event) => {
  if (!event?.origin?.includes("gamelaunchevent")) openCurrentWindow();
});
openCurrentWindow();
function overlayEnabled() {
  try {
    return ["recommended-build", "counter-items"].some(
      (key) => localStorage.getItem(overlayPreferenceKey(key)) === "true",
    );
  } catch {
    return false;
  }
}
function syncOverlay() {
  for (const [name, key] of overlayWindows) {
    if (running && localStorage.getItem(overlayPreferenceKey(key)) === "true")
      showWindow(name);
    else {
      windowRevisions[name]++;
      overwolf.windows.close(name, () => {});
    }
  }
}
window.addEventListener("storage", (event) => {
  if (
    event.key === null ||
    ["scout.overlay.recommended-build", "scout.overlay.counter-items"].includes(
      event.key ?? "",
    )
  )
    syncOverlay();
});
