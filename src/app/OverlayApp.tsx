import { useOverlayWindow } from "@/platform/overwolf/hooks/useOverlayWindow";
import { useSyncExternalStore } from "react";
import type { Catalog } from "@/shared/catalog/types";
import type { CounterlockStore } from "@/features/match/types";
import { useOverlayPreference } from "@/features/overlay/hooks/useOverlayPreference";
import { CompactBuild } from "@/features/builds/components/CompactBuild";
import { CompactCounters } from "@/features/counters/components/CompactCounters";

export function OverlayApp({
  name,
  catalog,
  store,
}: {
  name: string;
  catalog: Catalog;
  store: CounterlockStore;
}) {
  const build = name === "in_game";
  const [, setEnabled] = useOverlayPreference(
    build ? "recommended-build" : "counter-items",
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { opacity, id, save } = useOverlayWindow(name);
  return (
    <main className="scout-hud" style={{ opacity: opacity / 100 }}>
      <header
        className="hud-handle"
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest("button"))
            return;
          e.currentTarget.setPointerCapture(e.pointerId);
          if (id.current) overwolf.windows.dragMove(id.current, () => save());
        }}
      >
        <strong>⠿ {build ? "Recommended build" : "Counter items"}</strong>
        <button
          aria-label={`Hide ${build ? "recommended build" : "counter items"} overlay`}
          onClick={() => {
            save();
            setEnabled(false);
          }}
        >
          ×
        </button>
      </header>
      {build ? (
        <CompactBuild catalog={catalog} state={state} />
      ) : (
        <CompactCounters catalog={catalog} state={state} />
      )}
    </main>
  );
}
