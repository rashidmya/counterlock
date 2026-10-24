import { useSyncExternalStore, type CSSProperties } from "react";
import { useOverlayWindow } from "@/platform/overwolf/hooks/useOverlayWindow";
import type { Catalog } from "@/shared/catalog/types";
import type { CounterlockStore } from "@/features/match/types";
import { useOverlayPreference } from "@/features/overlay/hooks/useOverlayPreference";
import { panelForWindow, type OVERLAY_PANELS } from "@/features/overlay/panels";
import { DamageMeter } from "@/features/overlay/components/DamageMeter";
import { AveragePanel } from "@/features/overlay/components/AveragePanel";
import { SpawnTimers } from "@/features/overlay/components/SpawnTimers";

export function OverlayApp({
  name,
  catalog,
  store,
}: {
  name: string;
  catalog: Catalog;
  store: CounterlockStore;
}) {
  const panel = panelForWindow(name);
  return panel ? (
    <OverlayFrame panel={panel} catalog={catalog} store={store} />
  ) : (
    <main className="scout-hud">
      <p className="hud-empty">Overlay unavailable.</p>
    </main>
  );
}
function OverlayFrame({
  panel,
  catalog,
  store,
}: {
  panel: (typeof OVERLAY_PANELS)[number];
  catalog: Catalog;
  store: CounterlockStore;
}) {
  const [, setEnabled] = useOverlayPreference(panel.id);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { opacity, id, save } = useOverlayWindow(panel.windowName);
  const waiting = !state.players.length || state.phase !== "GameInProgress";
  return (
    <main
      className="scout-hud"
      style={{ "--hud-opacity": opacity / 100 } as CSSProperties}
    >
      <header
        className="hud-handle"
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          if (id.current)
            overwolf.windows.dragMove(id.current, () => {
              void save();
            });
        }}
      >
        <h2 tabIndex={-1}>{panel.title}</h2>
        <button
          type="button"
          aria-label={`Hide ${panel.title.toLowerCase()} overlay`}
          onClick={async () => {
            await save();
            setEnabled(false);
          }}
        >
          ×
        </button>
      </header>
      <div className="hud-body">
        {state.error && (
          <p className="hud-provider-error" role="status">
            {state.error}
          </p>
        )}
        {state.phase === "PostGame" ? (
          <p className="hud-empty">Match ended.</p>
        ) : waiting ? (
          <p className="hud-empty">Waiting for a match.</p>
        ) : (
          <>
            <div className="hud-state">
              <span>{state.clock}</span>
              {state.paused === true && <strong>Paused</strong>}
            </div>
            {panel.id === "you-vs-average" ? (
              <AveragePanel state={state} />
            ) : panel.id === "spawn-timers" ? (
              <SpawnTimers state={state} />
            ) : (
              <DamageMeter
                state={state}
                catalog={catalog}
                metric={
                  panel.id === "hero-damage"
                    ? "heroDamage"
                    : panel.id === "objective-damage"
                      ? "objectiveDamage"
                      : "healing"
                }
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
