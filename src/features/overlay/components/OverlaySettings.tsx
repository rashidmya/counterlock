import { overlayOpacityKey } from "../preferences";

export interface OverlaySettingsProps {
  overlaySettings: boolean;
  overlayBuild: boolean;
  setShowBuild: (value: boolean) => void;
  overlayCounters: boolean;
  setShowCounters: (value: boolean) => void;
  opacity: number;
  setOpacity: (value: number) => void;
}
export function OverlaySettings({
  overlaySettings,
  overlayBuild,
  setShowBuild,
  overlayCounters,
  setShowCounters,
  opacity,
  setOpacity,
}: OverlaySettingsProps) {
  return (
    <section className="settings panel">
      {overlaySettings && (
        <>
          <label>
            <input
              type="checkbox"
              checked={overlayBuild}
              onChange={(e) => setShowBuild(e.target.checked)}
            />{" "}
            Recommended build in overlay
          </label>
          <label>
            <input
              type="checkbox"
              checked={overlayCounters}
              onChange={(e) => setShowCounters(e.target.checked)}
            />{" "}
            Counter items in overlay
          </label>
        </>
      )}

      {overlaySettings && (
        <label>
          Overlay opacity{" "}
          <input
            aria-label="Overlay opacity"
            type="range"
            min="35"
            max="100"
            value={opacity}
            onChange={(e) => {
              setOpacity(Number(e.target.value));
              localStorage.setItem(overlayOpacityKey, e.target.value);
            }}
          />
          {opacity}%
        </label>
      )}

      <span>Hide the overlay to return full control to the game.</span>
    </section>
  );
}
