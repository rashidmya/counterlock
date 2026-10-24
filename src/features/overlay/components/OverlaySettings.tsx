import { overlayOpacityKey } from "../preferences";
import { OVERLAY_PANELS } from "../panels";
import { useOverlayPreference } from "../hooks/useOverlayPreference";

export interface OverlaySettingsProps {
  hotkey: string;
  overlaySettings: boolean;
  opacity: number;
  setOpacity: (value: number) => void;
}
export function OverlaySettings({
  hotkey,
  overlaySettings,
  opacity,
  setOpacity,
}: OverlaySettingsProps) {
  return (
    <section className="settings panel">
      <div className="settings-hotkey">
        <span>Show / hide overlay</span>
        <kbd>{hotkey}</kbd>
      </div>
      {overlaySettings && (
        <div className="settings-overlays">
          {OVERLAY_PANELS.map((panel) => (
            <OverlayToggle key={panel.id} panel={panel} />
          ))}
        </div>
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
              try {
                localStorage.setItem(overlayOpacityKey, e.target.value);
              } catch {
                /* Keep the desktop control usable without storage. */
              }
            }}
          />
          {opacity}%
        </label>
      )}

      <span className="settings-hint">
        Hide the overlay to return full control to the game.
      </span>
    </section>
  );
}

function OverlayToggle({ panel }: { panel: (typeof OVERLAY_PANELS)[number] }) {
  const [enabled, setEnabled] = useOverlayPreference(panel.id);
  return (
    <label>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => setEnabled(event.target.checked)}
      />
      {panel.title} overlay
    </label>
  );
}
