import { useHotkey } from "@/platform/overwolf/hooks/useHotkey";
import {
  hideCurrentWindow,
  dragCurrentWindow,
} from "@/platform/overwolf/window-controls";
import { readOverlayOpacity } from "@/features/overlay/preferences";
import { useState, useSyncExternalStore } from "react";
import { catalog } from "@/shared/catalog";
import { Icon } from "@/shared/ui/Icon";
import { bridge, inOverwolf, waiting } from "@/platform/overwolf/store-bridge";
import {
  kWindowNames,
  type ForegroundWindowName,
} from "@/platform/overwolf/constants";
import { useDeadlockRunning } from "@/platform/overwolf/hooks/useDeadlockRunning";
import { useOverlayPreference } from "@/features/overlay/hooks/useOverlayPreference";
import { OverlaySettings } from "@/features/overlay/components/OverlaySettings";
import { useCounters } from "@/features/counters/hooks/useCounters";
import { usePlayerLookup } from "@/features/player-lookup/hooks/usePlayerLookup";
import { PlayerLookup } from "@/features/player-lookup/components/PlayerLookup";
import { MatchOverview } from "@/features/match/components/MatchOverview";

export function DesktopApp({
  windowName,
}: {
  windowName: ForegroundWindowName;
}) {
  const live = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const state = inOverwolf ? live : waiting;
  const counters = useCounters(state);
  const [tab, setTab] = useState<"match" | "lookup">("match");
  const [opacity, setOpacity] = useState(readOverlayOpacity);
  const gameRunning = useDeadlockRunning();
  const overlaySettings = windowName === kWindowNames.desktop && gameRunning;
  const [settings, setSettings] = useState(false);
  const [overlayBuild, setShowBuild] =
    useOverlayPreference("recommended-build");
  const [overlayCounters, setShowCounters] =
    useOverlayPreference("counter-items");
  const showBuild = windowName === kWindowNames.desktop || overlayBuild;
  const showCounters = windowName === kWindowNames.desktop || overlayCounters;
  const lookup = usePlayerLookup();
  const hotkey = useHotkey();
  return (
    <main
      className="app compact"
      style={{ "--panel-opacity": 1 } as React.CSSProperties}
    >
      {windowName === kWindowNames.inGame && (
        <div className="scout-overlay-bar">
          <strong>Deadlock overlay</strong>
          <button onClick={hideCurrentWindow}>Hide overlay</button>
        </div>
      )}
      <header onMouseDown={dragCurrentWindow}>
        <div className="brand">
          <img src="../icon.svg" alt="" />
          <div>
            COUNTER<b>LOCK</b>
            <small>KNOW THE MATCH. MAKE YOUR MOVE.</small>
          </div>
        </div>
        <div className="header-right">
          <span className="connection">
            <span />
            {state.players.length ? "LIVE MATCH" : "STANDBY"}
          </span>
          <button
            className="icon-button"
            aria-label="Overlay settings"
            onClick={() => setSettings(!settings)}
          >
            ⚙
          </button>
          {inOverwolf && (
            <button
              className="icon-button"
              aria-label={
                windowName === kWindowNames.inGame
                  ? "Hide overlay"
                  : "Hide window"
              }
              onClick={hideCurrentWindow}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </header>
      <nav>
        <div className="tabs">
          <button
            className={tab === "match" ? "active" : ""}
            onClick={() => setTab("match")}
          >
            <Icon name="eye" />
            Match overview
          </button>
          <button
            className={tab === "lookup" ? "active" : ""}
            onClick={() => setTab("lookup")}
          >
            Player lookup
          </button>
        </div>
        <span className="shortcut">
          TOGGLE OVERLAY <kbd>{hotkey}</kbd>
        </span>
      </nav>
      {settings && (
        <OverlaySettings
          {...{
            overlaySettings,
            overlayBuild,
            setShowBuild,
            overlayCounters,
            setShowCounters,
            opacity,
            setOpacity,
          }}
        />
      )}
      {tab === "match" ? (
        <MatchOverview
          {...{ state, showBuild, showCounters, counters }}
          refresh={bridge.refresh}
        />
      ) : (
        <PlayerLookup model={lookup} />
      )}
      <footer>
        <span>
          <span className="footer-dot" /> DEADLOCK API + OVERWOLF
          <span className="divider">/</span>Catalog{" "}
          {new Date(catalog.fetchedAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
        <a
          href="https://api.deadlock-api.com/docs"
          target="_blank"
          rel="noreferrer"
        >
          Data source ↗
        </a>
      </footer>
    </main>
  );
}
