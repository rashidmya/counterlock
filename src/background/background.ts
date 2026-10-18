import { LiveStore } from "../store";
import {
  kGameClassIds,
  kGamesFeatures,
  kHotkeys,
  kWindowNames,
  type ForegroundWindowName,
} from "../consts";

const store = new LiveStore();
window.counterlockStore = store;
let running = false;
let initialized = false;
let gameRevision = 0;
let windowRevision = 0;
let registration = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
type GameInfo = Pick<overwolf.games.RunningGameInfo, "id" | "isRunning"> &
  Partial<Pick<overwolf.games.RunningGameInfo, "classId">>;
const isDeadlock = (info: GameInfo | null | undefined) =>
  !!info?.isRunning &&
  kGameClassIds.includes(info.classId ?? Math.floor(info.id / 10));

function showWindow(name: ForegroundWindowName, toggle = false) {
  const token = ++windowRevision;
  const other =
    name === kWindowNames.inGame ? kWindowNames.desktop : kWindowNames.inGame;
  overwolf.windows.close(other);
  overwolf.windows.obtainDeclaredWindow(name, (result) => {
    if (token !== windowRevision) return;
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
    showWindow(kWindowNames.inGame);
  } else {
    registration++;
    store.reset();
    showWindow(kWindowNames.desktop);
  }
  return true;
}
function openCurrentWindow() {
  const revision = gameRevision;
  overwolf.games.getRunningGameInfo((info) => {
    if (revision !== gameRevision) return;
    if (!onGame(info))
      showWindow(running ? kWindowNames.inGame : kWindowNames.desktop);
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
  if (event.name === kHotkeys.toggle && running)
    showWindow(kWindowNames.inGame, true);
});
overwolf.extensions.onAppLaunchTriggered.addListener((event) => {
  if (!event?.origin?.includes("gamelaunchevent")) openCurrentWindow();
});
openCurrentWindow();
