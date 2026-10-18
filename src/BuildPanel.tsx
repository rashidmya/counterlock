import { useMemo, useState } from "react";
import { buildPhase, recommendedBuild } from "./builds";
import { ItemIcon } from "./ItemIcon";
import { Picture } from "./Picture";
import { winRate } from "./game";
import type { Catalog, MatchState } from "./types";

export function BuildPanel({
  catalog,
  state,
}: {
  catalog: Catalog;
  state: MatchState;
}) {
  const [selection, setSelection] = useState("local");
  const [expanded, setExpanded] = useState(true);
  const local = state.players.find((p) => p.local);
  const id = selection === "local" ? local?.heroId : Number(selection);
  const hero = catalog.heroes.find((h) => h.id === id);
  const stats =
    local?.accountId != null ? state.stats[local.accountId] : undefined;
  const history = stats?.heroes?.find((entry) => entry.hero_id === id);
  const rate = history ? winRate(history.wins, history.matches_played) : null;
  const playingHero = state.phase === "GameInProgress" && local?.heroId === id;
  const historyReason = !local
    ? "Join a match to see your hero history."
    : local.accountId == null
      ? "Player ID unavailable."
      : state.loading && !stats
        ? "Loading your hero history."
        : (stats?.heroError ??
          "Your recorded history on this hero; build-specific results are unavailable.");
  const stages = useMemo(
    () =>
      recommendedBuild(
        hero,
        catalog.items,
        local && local.heroId === id ? local.items : [],
      ),
    [hero, catalog.items, local, id],
  );
  const timestamp = hero?.popularItems?.timestamp;
  const hasItems = stages.some((stage) => stage.items.length > 0);
  const activePhase =
    state.phase === "GameInProgress" ? buildPhase(state.clock) : null;

  return (
    <section className="build-panel panel" aria-label="Recommended hero build">
      <div className="build-heading">
        <div className="build-title">
          {hero ? (
            <Picture
              key={hero.id}
              className="build-hero-portrait"
              src={hero.image}
              label={hero.name}
            />
          ) : (
            <span className="build-emblem">◇</span>
          )}
          <div>
            <p className="eyebrow">
              {playingHero
                ? state.mode === "demo"
                  ? "YOUR HERO · DEMO"
                  : "YOUR HERO · IN GAME"
                : "HERO BUILD PREVIEW"}
            </p>
            <h2>
              Recommended build <span>{hero?.name ?? "Choose a hero"}</span>
            </h2>
          </div>
        </div>
        {hero && (
          <div
            className="build-history"
            role="group"
            aria-label="Your hero history"
            title={historyReason}
          >
            <span>
              <strong>{rate == null ? "—" : `${rate.toFixed(1)}%`}</strong>
              <small>HERO WIN RATE</small>
            </span>
            <span>
              <strong>{history?.matches_played.toLocaleString() ?? "—"}</strong>
              <small>HERO GAMES</small>
            </span>
          </div>
        )}
        <div className="build-controls">
          <label>
            <span>BUILD HERO</span>
            <select
              aria-label="Build hero"
              value={selection}
              onChange={(event) => setSelection(event.target.value)}
            >
              <option value="local">
                {local
                  ? `My hero · ${local.heroName}`
                  : "My hero · waiting for match"}
              </option>
              {[...catalog.heroes]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            aria-label={
              expanded
                ? "Collapse recommended build"
                : "Expand recommended build"
            }
            aria-expanded={expanded}
            aria-controls="build-content"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "−" : "+"}
          </button>
        </div>
      </div>
      {expanded && (
        <div id="build-content">
          {hero && hasItems ? (
            <div className="build-stages">
              {stages.map((stage, index) => (
                <div
                  className={`build-stage ${activePhase === stage.key ? "current-stage" : ""}`}
                  key={stage.key}
                  aria-current={activePhase === stage.key ? "step" : undefined}
                >
                  <h3>
                    <span>0{index + 1}</span>
                    {stage.title}
                    <small className="stage-time">{stage.timeRange}</small>
                    {activePhase === stage.key && (
                      <b className="stage-now">NOW</b>
                    )}
                  </h3>
                  <div className="build-items">
                    {stage.items.map(
                      ({ item, pickRate, owned, sourcePhase }) => (
                        <div
                          className={`build-item ${owned ? "owned" : ""}`}
                          key={item.id}
                          tabIndex={0}
                          aria-label={`${item.name}, ${item.cost.toLocaleString()} souls${owned ? ", owned" : ""}`}
                          title={`${item.name} · ${item.cost.toLocaleString()} souls\n${pickRate.toFixed(1)}% ${sourcePhase.replace("_", " ")} pick rate${sourcePhase !== stage.key ? "\nAffordable flex option from another phase" : ""}${owned ? "\nAlready owned" : ""}\n${item.description}`}
                        >
                          <div className="build-art">
                            <ItemIcon item={item} />
                            {owned && (
                              <span className="owned-mark" aria-hidden="true">
                                ✓
                              </span>
                            )}
                          </div>
                          <strong>{item.name}</strong>
                          <small>
                            {owned
                              ? "OWNED"
                              : `${item.cost.toLocaleString()} souls`}
                            {sourcePhase !== stage.key && (
                              <span className="flex-label"> · FLEX</span>
                            )}
                          </small>
                        </div>
                      ),
                    )}
                    {stage.items.length === 0 && (
                      <p className="build-empty-stage">
                        No recorded picks for this phase.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="build-empty">
              {hero
                ? `No build data available for ${hero.name}.`
                : "Select a hero to see a build, or follow your hero when a match starts."}
            </p>
          )}
          {hero && hasItems && (
            <p className="build-source">
              Popular item path · build-specific results unavailable.
              {timestamp
                ? ` Data generated ${new Date(timestamp * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.`
                : ""}
              <a
                href="https://api.deadlock-api.com/docs"
                target="_blank"
                rel="noreferrer"
                title="Valve-generated popular item data served by Deadlock API"
              >
                Deadlock API ↗
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
