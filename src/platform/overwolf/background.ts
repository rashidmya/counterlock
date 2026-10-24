import { isDeadlock, type GameInfo } from "./game";
import {
  overlayPreferenceKey,
  readOverlayEnabled,
} from "@/features/overlay/preferences";
import { OVERLAY_PANELS } from "@/features/overlay/panels";
import { recordDetectedAccount } from "@/features/profile/storage";
import { LiveStore } from "@/features/match/store/LiveStore";
import { decode } from "@/features/match/utils/game";
import {
  kGamesFeatures,
  kHotkeys,
  kWindowNames,
  type ForegroundWindowName,
} from "./constants";

const store = new LiveStore();
window.counterlockStore = store;
store.subscribe(() => recordDetectedAccount(store.getSnapshot()));
let running = false;
let initialized = false;
let gameRevision = 0;
const windowRevisions = new Map<string, number>();
let overlaysShown = true;
let registration = 0;
let retry: ReturnType<typeof setTimeout> | undefined;

function invalidateWindow(name: string) {
  const token = (windowRevisions.get(name) ?? 0) + 1;
  windowRevisions.set(name, token);
  return token;
}
function showWindow(name: ForegroundWindowName) {
  const token = invalidateWindow(name);
  overwolf.windows.obtainDeclaredWindow(name, (result) => {
    if (token !== windowRevisions.get(name)) return;
    if (!result.success) {
      store.patch({ error: `Unable to open the ${name} window.` });
      return;
    }
    overwolf.windows.restore(result.window.id);
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
    overlaysShown = true;
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
    if (event.name === "match_end")
      store.patch({ phase: "PostGame", paused: false });
    if (event.name === "match_start") {
      const previous = store.getSnapshot();
      if (previous.phase === "PostGame") store.reset();
      store.patch({
        status: previous.status,
        localAccountId: previous.localAccountId,
        gameMode: previous.gameMode,
        phase: "GameInProgress",
        clock: "00:00",
        paused: false,
      });
      store.refresh();
    }
    if (event.name === "match_clock")
      store.ingest({ match_info: { match_clock: event.data } });
    if (event.name === "game_paused") {
      const paused = decode(event.data);
      if (typeof paused === "boolean") store.patch({ paused });
    }
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
  if (event.name === kHotkeys.toggle && running && overlayEnabled()) {
    overlaysShown = !overlaysShown;
    syncOverlay();
  }
});
overwolf.extensions.onAppLaunchTriggered.addListener((event) => {
  if (!event?.origin?.includes("gamelaunchevent")) openCurrentWindow();
});
openCurrentWindow();
function overlayEnabled() {
  return OVERLAY_PANELS.some((panel) => readOverlayEnabled(panel.id));
}
function syncOverlay() {
  for (const panel of OVERLAY_PANELS) {
    if (running && readOverlayEnabled(panel.id)) {
      if (overlaysShown) showWindow(panel.windowName);
      else {
        invalidateWindow(panel.windowName);
        overwolf.windows.hide(panel.windowName);
      }
    } else {
      invalidateWindow(panel.windowName);
      overwolf.windows.close(panel.windowName, () => {});
    }
  }
}
window.addEventListener("storage", (event) => {
  if (
    event.key === null ||
    OVERLAY_PANELS.some((panel) => overlayPreferenceKey(panel.id) === event.key)
  )
    syncOverlay();
});
