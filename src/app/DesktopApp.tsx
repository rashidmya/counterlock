import { useHotkey } from "@/platform/overwolf/hooks/useHotkey";
import {
  hideCurrentWindow,
  dragCurrentWindow,
} from "@/platform/overwolf/window-controls";
import { readOverlayOpacity } from "@/features/overlay/preferences";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { HomePage } from "@/features/home/components/HomePage";
import { MyProfileLabel } from "@/features/profile/components/MyProfileLabel";
import { ProfilePage } from "@/features/profile/components/ProfilePage";
import { accountSubtitle, useDesktopMe } from "@/features/profile/me";
import { TierListPage } from "@/features/heroes/components/TierListPage";
import { HeroesPage } from "@/features/heroes/components/HeroesPage";
import { ItemsPage } from "@/features/items/components/ItemsPage";
import type { AnalyticsQuery } from "@/features/heroes/utils/analytics";
import { LivePage } from "@/features/live/components/LivePage";
import {
  liveStatus,
  matchKey,
  shouldAutoSwitch,
} from "@/features/live/utils/live-status";
import { LinkProvider } from "./links";
import type { Page, Route } from "./navigation";

const tabs: { page: Page; label: string }[] = [
  { page: "home", label: "Home" },
  { page: "live", label: "Live" },
  { page: "tierlist", label: "Tier list" },
  { page: "heroes", label: "Heroes" },
  { page: "items", label: "Items" },
];
export function DesktopApp({
  windowName,
}: {
  windowName: ForegroundWindowName;
}) {
  const live = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const state = inOverwolf ? live : waiting;
  const counters = useCounters(state);
  const [route, setRoute] = useState<Route>({ page: "home" });
  const [visited, setVisited] = useState<Page[]>(["home"]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const me = useDesktopMe();
  const [query, setQuery] = useState<AnalyticsQuery>({ minBadge: 0 });
  const userNavigated = useRef(false);
  const matchSeen = useRef<string | null>(null);
  const [opacity, setOpacity] = useState(readOverlayOpacity);
  const gameRunning = useDeadlockRunning();
  const status = liveStatus(gameRunning, state);
  const show = (next: Route) => {
    if (next.page === "profile" && next.accountId === undefined)
      next = { page: "home" };
    if (next.page === "profile") setProfileId(next.accountId ?? null);
    setRoute(next);
    setVisited((pages) =>
      pages.includes(next.page) ? pages : [...pages, next.page],
    );
  };
  const navigate = (next: Route) => {
    userNavigated.current = true;
    show(next);
  };
  useEffect(() => {
    if (gameRunning && !userNavigated.current) show({ page: "live" });
  }, [gameRunning]);
  const key = matchKey(state);
  useEffect(() => {
    if (shouldAutoSwitch(matchSeen.current, key)) show({ page: "live" });
    matchSeen.current = key;
  }, [key]);
  const overlaySettings = windowName === kWindowNames.desktop && gameRunning;
  const [settings, setSettings] = useState(false);
  const [overlayBuild, setShowBuild] =
    useOverlayPreference("recommended-build");
  const [overlayCounters, setShowCounters] =
    useOverlayPreference("counter-items");
  const showBuild = windowName === kWindowNames.desktop || overlayBuild;
  const showCounters = windowName === kWindowNames.desktop || overlayCounters;
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
          <span>
            Counter<b>lock</b>
          </span>
        </div>
        <div className="tabs" role="navigation" aria-label="Main">
          {tabs.map(({ page, label }) => (
            <button
              key={page}
              className={route.page === page ? "active" : ""}
              onClick={() => navigate({ page })}
            >
              {label}
              {page === "live" && status === "in-match" && (
                <span className="live-dot" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        <div className="header-right">
          {status === "in-match" && (
            <span className="live-badge">
              <i aria-hidden="true" />
              LIVE MATCH
            </span>
          )}
          <button
            className="my-profile"
            aria-label="My profile"
            onClick={() =>
              navigate(
                me.meId === null
                  ? { page: "home" }
                  : { page: "profile", accountId: me.meId },
              )
            }
          >
            <MyProfileLabel meId={me.meId} />
          </button>
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
      {settings && (
        <OverlaySettings
          {...{
            hotkey,
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
      <LinkProvider value={{ navigate }}>
        {visited.includes("home") && (
          <div className="page" hidden={route.page !== "home"}>
            <HomePage me={me} />
          </div>
        )}
        {visited.includes("profile") && profileId !== null && (
          <div className="page" hidden={route.page !== "profile"}>
            <ProfilePage
              key={profileId}
              accountId={profileId}
              me={me}
              navigate={navigate}
              subtitle={
                me.account?.accountId === profileId
                  ? accountSubtitle(me.account)
                  : undefined
              }
            />
          </div>
        )}
        {visited.includes("live") && (
          <div className="page" hidden={route.page !== "live"}>
            <LivePage
              {...{
                state,
                status,
                showBuild,
                showCounters,
                counters,
                navigate,
                meId: me.meId,
              }}
              refresh={bridge.refresh}
            />
          </div>
        )}
        {visited.includes("tierlist") && (
          <div className="page" hidden={route.page !== "tierlist"}>
            <TierListPage navigate={navigate} />
          </div>
        )}
        {visited.includes("heroes") && (
          <div className="page" hidden={route.page !== "heroes"}>
            <HeroesPage
              {...{ route, navigate, query, setQuery }}
              liveEnemies={
                status === "in-match"
                  ? counters.teams.enemies.map((p) => p.heroId)
                  : []
              }
            />
          </div>
        )}
        {visited.includes("items") && (
          <div className="page" hidden={route.page !== "items"}>
            <ItemsPage {...{ route, navigate, query, setQuery }} />
          </div>
        )}
      </LinkProvider>
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
