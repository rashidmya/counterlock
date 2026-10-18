import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import catalogData from "./data/catalog.json";
import { demoState } from "./demo";
import { accountId, initialState, splitTeams, winRate } from "./game";
import { recommend, threatLabels, heroThreats } from "./counters";
import { StatsClient } from "./api";
import { BuildPanel } from "./BuildPanel";
import { ItemIcon } from "./ItemIcon";
import { Picture } from "./Picture";
import { kWindowNames, type ForegroundWindowName } from "./consts";
import type { Catalog, MatchState, Player, CounterlockStore, Threat } from "./types";
import "./style.css";

const catalog: Catalog = catalogData;
const inOverwolf = typeof overwolf !== "undefined";
const demo = demoState();
const waiting = {
  ...initialState(),
  status: "Browser preview — live events need Overwolf",
};
const fallback: CounterlockStore = {
  getSnapshot: () => (inOverwolf ? initial : demo),
  subscribe: () => () => {},
  refresh: () => {},
};
const initial = initialState();
const bridge = inOverwolf
  ? (overwolf.windows.getMainWindow().counterlockStore ?? fallback)
  : fallback;
const heroById = new Map(catalog.heroes.map((h) => [h.id, h]));
const lookupClient = new StatsClient();

function Icon({
  name,
}: {
  name: "eye" | "refresh" | "close" | "arrow" | "shield";
}) {
  const paths = {
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
function PlayerRow({
  player,
  state,
  enemy,
  selected,
  onSelect,
}: {
  player: Player;
  state: MatchState;
  enemy: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const hero = heroById.get(player.heroId);
  const stats = player.accountId ? state.stats[player.accountId] : undefined;
  const history = stats?.heroes?.find((h) => h.hero_id === player.heroId);
  const rank = stats?.rank;
  const rankMeta = rank
    ? catalog.ranks.find((r) => r.tier === rank.rank)
    : undefined;
  const rate = history ? winRate(history.wins, history.matches_played) : null;
  const reason = !player.accountId
    ? "Steam ID unavailable"
    : state.loading && !stats
      ? "Loading statistics"
      : (stats?.heroError ??
        (history ? "Recorded matches on this hero" : "No recorded hero data"));
  return (
    <tr
      className={`${selected ? "selected" : ""} ${player.local ? "local" : ""}`}
    >
      <td>
        <button
          className="player-button"
          onClick={onSelect}
          disabled={!enemy}
          aria-pressed={enemy ? selected : undefined}
          aria-label={
            enemy ? `Counter ${hero?.name ?? player.heroName}` : undefined
          }
        >
          <Picture
            className="portrait"
            src={hero?.image}
            label={player.heroName}
          />
          <span className="player-label">
            <strong>
              {hero?.name ?? player.heroName}
              {player.local && <i>YOU</i>}
            </strong>
            <small>{player.name}</small>
          </span>
        </button>
      </td>
      <td
        title={
          stats?.rankError ??
          (rank?.last_match
            ? `Rank from recorded match: ${new Date(rank.last_match.start_time * 1000).toLocaleDateString()}`
            : "Latest recorded rank, when available")
        }
      >
        <span className="rank">
          <Picture
            className="rank-icon"
            src={rankMeta?.image}
            label={rankMeta?.name ?? "?"}
          />
          <span>
            {rankMeta
              ? `${rankMeta.name}${rank?.subrank ? ` ${rank.subrank}` : ""}`
              : "Unavailable"}
          </span>
        </span>
      </td>
      <td title={reason}>
        <span className={rate != null && rate >= 55 ? "positive" : "numeric"}>
          {rate == null ? "—" : `${rate.toFixed(1)}%`}
        </span>
        {rate != null && (
          <span className="rate-line">
            <span style={{ width: `${rate}%` }} />
          </span>
        )}
      </td>
      <td title={reason} className="numeric">
        {history?.matches_played.toLocaleString() ?? "—"}
      </td>
      <td className="kda">
        {player.kills}
        <span>/</span>
        {player.deaths}
        <span>/</span>
        {player.assists}
      </td>
    </tr>
  );
}
function Team({
  title,
  subtitle,
  players,
  state,
  enemy,
  selected,
  select,
}: {
  title: string;
  subtitle: string;
  players: Player[];
  state: MatchState;
  enemy: boolean;
  selected: string | null;
  select: (slot: string) => void;
}) {
  return (
    <section className={`team panel ${enemy ? "enemy" : "ally"}`}>
      <div className="panel-heading">
        <div>
          <span className="team-mark" />
          <h2>{title}</h2>
          <span className="count">{players.length}</span>
        </div>
        <span className="muted">{subtitle}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>HERO / PLAYER</th>
              <th>RANK</th>
              <th>HERO WIN %</th>
              <th>GAMES</th>
              <th>K / D / A</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <PlayerRow
                key={player.slot}
                {...{ player, state, enemy }}
                selected={selected === player.slot}
                onSelect={() => select(player.slot)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!players.length && (
        <div className="empty">
          <Icon name="eye" />
          <p>Waiting for the match roster</p>
          <small>
            Players appear when Overwolf reports their heroes and teams.
          </small>
        </div>
      )}
    </section>
  );
}

function App({ windowName }: { windowName: ForegroundWindowName }) {
  const live = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [preview, setPreview] = useState(!inOverwolf);
  const state = preview ? demo : inOverwolf ? live : waiting;
  const [selected, setSelected] = useState<string | null>(null);
  const [budget, setBudget] = useState(6400);
  const [manual, setManual] = useState<Threat[]>([]);
  const [tab, setTab] = useState<"match" | "lookup">("match");
  const [compact, setCompact] = useState(true);
  const [opacity, setOpacity] = useState(96);
  const [settings, setSettings] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const [lookupHero, setLookupHero] = useState(7);
  const [lookup, setLookup] = useState<MatchState | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [hotkey, setHotkey] = useState("Ctrl + Shift + S");
  const teams = splitTeams(state.players);
  const selectedPlayer = teams.enemies.find((p) => p.slot === selected);
  const targets = selectedPlayer ? [selectedPlayer] : teams.enemies;
  const owned = state.players.find((p) => p.local)?.items ?? [];
  const recommendations = useMemo(
    () => recommend(targets, catalog.items, budget, owned, manual),
    [targets, budget, owned, manual],
  );
  const unknownProfiles = targets.filter((p) => !heroThreats[p.heroId]);
  const missingIds = state.players.filter((p) => !p.accountId).length;
  const errorStats = Object.values(state.stats).some(
    (s) => s.heroError || s.rankError,
  );

  useEffect(() => {
    setSelected(null);
    setManual([]);
  }, [state.matchId, preview]);
  useEffect(() => {
    setManual([]);
  }, [selectedPlayer?.slot]);
  useEffect(() => {
    if (!inOverwolf) return;
    overwolf.settings.hotkeys.get((result) => {
      if (result.success) {
        const assignment =
          Object.values(result.games ?? {})
            .flat()
            .find((h) => h.name === "toggle_counterlock") ??
          result.globals?.find((h) => h.name === "toggle_counterlock");
        if (assignment) setHotkey(assignment.binding || "Unassigned");
      }
    });
  }, []);
  async function findPlayer(event: React.FormEvent) {
    event.preventDefault();
    const id = accountId(lookupId);
    if (!id) {
      setLookupError(
        "Enter a valid SteamID64, account ID, or [U:1:account] ID.",
      );
      return;
    }
    setLookupBusy(true);
    setLookupError("");
    setLookup(null);
    try {
      const stats = await lookupClient.load([id], "normal");
      const hero = heroById.get(lookupHero)!;
      setLookup({
        ...initialState(),
        stats,
        players: [
          {
            slot: "lookup",
            name: `Account ${id}`,
            heroId: lookupHero,
            heroName: hero.name,
            team: 2,
            local: false,
            accountId: id,
            kills: 0,
            deaths: 0,
            assists: 0,
            items: [],
          },
        ],
      });
      if (stats[id].heroError || stats[id].rankError)
        setLookupError(
          [stats[id].heroError, stats[id].rankError].filter(Boolean).join(" "),
        );
    } catch {
      setLookupError(
        "Unable to retrieve player statistics. Please try again later.",
      );
    } finally {
      setLookupBusy(false);
    }
  }
  function close() {
    if (inOverwolf)
      overwolf.windows.getCurrentWindow((result) => {
        if (result.success) overwolf.windows.hide(result.window.id);
      });
  }
  function drag(event: React.MouseEvent) {
    if (
      inOverwolf &&
      event.button === 0 &&
      !(event.target as HTMLElement).closest("button, input, a")
    )
      overwolf.windows.getCurrentWindow((result) => {
        if (result.success) overwolf.windows.dragMove(result.window.id);
      });
  }
  return (
    <main
      className={`app ${compact ? "compact" : ""}`}
      style={{ "--panel-opacity": opacity / 100 } as React.CSSProperties}
    >
      <header onMouseDown={drag}>
        <div className="brand">
          <img src="../icon.svg" alt="" />
          <div>
            COUNTER<b>LOCK</b>
            <small>KNOW THE MATCH. MAKE YOUR MOVE.</small>
          </div>
        </div>
        <div className="header-right">
          <span className={`connection ${preview ? "demo" : ""}`}>
            <span />
            {preview
              ? "DEMO MODE"
              : state.players.length
                ? "LIVE MATCH"
                : "STANDBY"}
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
              onClick={close}
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
        <section className="settings panel">
          <label>
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
            />{" "}
            Compact rows
          </label>
          <label>
            Opacity{" "}
            <input
              aria-label="Opacity"
              type="range"
              min="65"
              max="100"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            {opacity}%
          </label>
          <label>
            <input
              type="checkbox"
              checked={preview}
              onChange={(e) => setPreview(e.target.checked)}
            />{" "}
            Demo match
          </label>
          <span>Hide the overlay to return full control to the game.</span>
        </section>
      )}
      {tab === "match" ? (
        <>
          <div className="intro">
            <div>
              <p className="eyebrow">YOUR MATCH, AT A GLANCE</p>
              <h1>A little intel. A better fight.</h1>
              <p className="muted">
                Scout the lineup and find the right answer to their heroes.
              </p>
            </div>
            <div className="match-clock">
              <span>
                {preview
                  ? "SAMPLE MATCH"
                  : state.phase === "PostGame"
                    ? "MATCH ENDED"
                    : state.gameMode === "street_brawl"
                      ? "STREET BRAWL"
                      : "STANDARD"}
              </span>
              <strong>{state.clock}</strong>
              <small>
                {state.matchId ? `Match #${state.matchId}` : state.status}
              </small>
            </div>
          </div>
          {preview && (
            <div className="notice">
              <span>PREVIEW</span>Player names, ranks, and match statistics
              below are sample data.
              <button onClick={() => setPreview(false)}>
                Switch to live <Icon name="arrow" />
              </button>
            </div>
          )}
          {!preview && state.error && (
            <div className="notice warning" role="alert">
              {state.error}
            </div>
          )}
          {!preview && !inOverwolf && (
            <div className="notice">
              Live roster detection runs in Overwolf on Windows. Player lookup
              works in this browser.
              <button onClick={() => setPreview(true)}>Show demo</button>
            </div>
          )}
          <div className="workspace">
            <div className="match-column">
              <BuildPanel
                key={`${preview}:${state.matchId}`}
                catalog={catalog}
                state={state}
              />
              <div className="rosters">
                {teams.team == null && state.players.length > 0 ? (
                  <Team
                    title="Detected players"
                    subtitle="Waiting for your team identity"
                    players={state.players}
                    {...{ state, selected }}
                    enemy={false}
                    select={setSelected}
                  />
                ) : (
                  <>
                    <Team
                      title="Your team"
                      subtitle={teams.team === 3 ? "SAPPHIRE" : "AMBER"}
                      players={teams.allies}
                      {...{ state, selected }}
                      enemy={false}
                      select={setSelected}
                    />
                    <Team
                      title="Enemy team"
                      subtitle="SELECT A HERO TO SEE COUNTERS"
                      players={teams.enemies}
                      {...{ state, selected }}
                      enemy
                      select={(slot) =>
                        setSelected(selected === slot ? null : slot)
                      }
                    />
                  </>
                )}
                <div className="data-note">
                  <span>
                    {state.loading
                      ? "Loading player statistics…"
                      : `${missingIds ? `${missingIds} player ID${missingIds === 1 ? "" : "s"} unavailable. ` : ""}Hero win rate and games use recorded history; coverage may be incomplete.`}
                    {errorStats ? " Some statistics could not be loaded." : ""}
                  </span>
                  <button
                    className="text-button"
                    disabled={preview || state.loading}
                    onClick={bridge.refresh}
                  >
                    <Icon name="refresh" />
                    Refresh
                  </button>
                </div>
              </div>
            </div>
            <aside className="counters panel">
              <div className="counter-heading">
                <div className="counter-icon">
                  <Icon name="shield" />
                </div>
                <div>
                  <p className="eyebrow">BUILD WITH INTENT</p>
                  <h2>Counter items</h2>
                </div>
              </div>
              <p className="muted">
                {selectedPlayer
                  ? `Items to consider against ${selectedPlayer.heroName}.`
                  : "Items to consider against their lineup."}
              </p>
              {teams.enemies.length > 0 && (
                <div
                  className="enemy-filters"
                  role="group"
                  aria-label="Enemy hero filters"
                >
                  <button
                    className="enemy-filter"
                    aria-label="All enemies"
                    aria-pressed={!selectedPlayer}
                    title="Counter the entire enemy team"
                    onClick={() => setSelected(null)}
                  >
                    All
                  </button>
                  {teams.enemies.map((enemy) => (
                    <button
                      className="enemy-filter"
                      key={enemy.slot}
                      aria-label={`Counter items for ${enemy.heroName}`}
                      aria-pressed={selectedPlayer?.slot === enemy.slot}
                      title={enemy.heroName}
                      onClick={() =>
                        setSelected(selected === enemy.slot ? null : enemy.slot)
                      }
                    >
                      <Picture
                        key={enemy.heroId}
                        className="enemy-filter-portrait"
                        src={heroById.get(enemy.heroId)?.image}
                        label={enemy.heroName}
                      />
                    </button>
                  ))}
                </div>
              )}
              <div className="focus">
                <span>{selectedPlayer?.heroName ?? "Entire enemy team"}</span>
                {selectedPlayer ? (
                  <button
                    aria-label="Clear hero selection"
                    onClick={() => setSelected(null)}
                  >
                    <Icon name="close" />
                  </button>
                ) : (
                  <span>{teams.enemies.length} HEROES</span>
                )}
              </div>
              <label className="budget">
                ITEM BUDGET
                <select
                  aria-label="Item budget"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                >
                  <option value={1600}>Up to 1,600 souls</option>
                  <option value={3200}>Up to 3,200 souls</option>
                  <option value={6400}>All budgets</option>
                </select>
              </label>
              <div className="recommendations">
                {recommendations.length ? (
                  recommendations.map((entry, i) => (
                    <article className="item-card" key={entry.item.id}>
                      <div className="item-top">
                        <ItemIcon item={entry.item} />
                        <div>
                          <span className="item-label">
                            {i === 0
                              ? "CONSIDER FIRST"
                              : entry.item.category.toUpperCase()}
                          </span>
                          <h3>{entry.item.name}</h3>
                        </div>
                        <span className="price">
                          {entry.item.cost.toLocaleString()}
                          <small>SOULS</small>
                        </span>
                      </div>
                      <p>{entry.reasons.join(" ")}</p>
                      <div className="targets">
                        {entry.targets.map((target) => (
                          <span key={target}>{target}</span>
                        ))}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty">
                    <p>No suggestions yet</p>
                    <small>
                      {targets.length
                        ? "Increase the budget or select a threat below."
                        : "Join a match or select a threat below."}
                    </small>
                  </div>
                )}
              </div>
              {unknownProfiles.length > 0 && (
                <p className="rule-note">
                  No starter profile for{" "}
                  {unknownProfiles.map((p) => p.heroName).join(", ")}. Choose
                  the threats you face below.
                </p>
              )}
              <details>
                <summary>Adjust for their build</summary>
                <p className="muted">
                  Add threats that match what you see in the game.
                </p>
                <div className="threats">
                  {Object.entries(threatLabels).map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={manual.includes(key as Threat)}
                      onClick={() =>
                        setManual((current) =>
                          current.includes(key as Threat)
                            ? current.filter((t) => t !== key)
                            : [...current, key as Threat],
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </details>
              <p className="rule-note">
                Rules-based suggestions. Consider your hero, build, timing, and
                available slots. Owned items are excluded when reported.
              </p>
            </aside>
          </div>
        </>
      ) : (
        <section className="lookup">
          <p className="eyebrow">LOOK UP A PLAYER</p>
          <h1>Know their hero history.</h1>
          <p className="muted">
            Use an exact Steam ID to check recorded rank, hero win rate, and
            games played.
          </p>
          <form className="panel" onSubmit={findPlayer}>
            <label>
              Steam ID
              <input
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                placeholder="SteamID64 or account ID"
                required
              />
            </label>
            <label>
              Hero
              <select
                value={lookupHero}
                onChange={(e) => setLookupHero(Number(e.target.value))}
              >
                {[...catalog.heroes]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary" disabled={lookupBusy}>
              {lookupBusy ? "Looking up…" : "Look up player"}
              <Icon name="arrow" />
            </button>
          </form>
          {lookupError && (
            <p role="alert" className="notice warning">
              {lookupError}
            </p>
          )}
          {lookup && (
            <Team
              title="Player history"
              subtitle="STANDARD · RECORDED HISTORY"
              players={lookup.players}
              state={lookup}
              enemy={false}
              selected={null}
              select={() => {}}
            />
          )}
          <p className="data-note">
            Rank is from the latest recorded ranked match. Missing or protected
            data appears as unavailable. Results are cached for five minutes.
            K/D/A is not included in this lookup.
          </p>
        </section>
      )}
      <footer>
        <span>
          <span className="footer-dot" />{" "}
          {preview && tab === "match" ? "DEMO DATA" : "DEADLOCK API + OVERWOLF"}
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
export function mountApp(windowName: ForegroundWindowName) {
  document.body.dataset.window = windowName;
  if (inOverwolf && windowName === kWindowNames.inGame)
    document.body.classList.add("overwolf");
  createRoot(document.getElementById("root")!).render(
    <App windowName={windowName} />,
  );
}
