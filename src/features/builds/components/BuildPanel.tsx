import { useState } from "react";
import { ItemIcon } from "@/shared/ui/ItemIcon";
import { Picture } from "@/shared/ui/Picture";
import { useMeasuredBuild } from "../hooks/useMeasuredBuild";
import type { Catalog } from "@/shared/catalog/types";
import type { MatchState } from "@/features/match/types";
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
  const result = useMeasuredBuild(id, state.gameMode, "desktop");
  const data = result?.data;
  const error = result?.error;
  const owned = local && local.heroId === id ? local.items : [];
  return (
    <section className="build-panel panel" aria-label="Recommended hero build">
      <div className="build-heading">
        <div className="build-title">
          {hero ? (
            <Picture
              className="build-hero-portrait"
              src={hero.image}
              label={hero.name}
            />
          ) : (
            <span className="build-emblem">◇</span>
          )}
          <div>
            <p className="eyebrow">COMMUNITY BUILD · MOST RECORDED MATCHES</p>
            <h2>
              Recommended build <span>{hero?.name ?? "Choose a hero"}</span>
            </h2>
            {data && (
              <small>
                {data.name} · #{data.stats.hero_build_id}
              </small>
            )}
          </div>
        </div>
        {hero && (
          <div
            className="build-history"
            role="group"
            aria-label="Build performance"
            title="Last 30 days, ranked and unranked. Build selected at match start; item purchases and later build changes may differ. Includes all build versions in that period."
          >
            <span>
              <strong>
                {data
                  ? `${((100 * data.stats.wins) / data.stats.matches).toFixed(1)}%`
                  : "—"}
              </strong>
              <small>BUILD WIN RATE</small>
            </span>
            <span>
              <strong>
                {data ? data.stats.matches.toLocaleString() : "—"}
              </strong>
              <small>BUILD GAMES</small>
            </span>
          </div>
        )}
        <div className="build-controls">
          <label>
            <span>BUILD HERO</span>
            <select
              aria-label="Build hero"
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
            >
              <option value="local">
                {local
                  ? `My hero · ${catalog.heroes.find((h) => h.id === local.heroId)?.name ?? local.heroName}`
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
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "−" : "+"}
          </button>
        </div>
      </div>
      {expanded && (
        <div id="build-content">
          {data ? (
            <>
              <div className="build-stages measured-build-stages">
                {data.groups.map((group, index) => (
                  <div className="build-stage" key={index}>
                    <h3>{group.name}</h3>
                    {group.description && (
                      <p className="muted">{group.description}</p>
                    )}
                    <div className="build-items">
                      {group.ids.map((itemId, i) => {
                        const item = catalog.items.find(
                          (item) => item.id === itemId,
                        );
                        const isOwned = owned.includes(itemId);
                        return item ? (
                          <div
                            key={`${itemId}:${i}`}
                            className={`build-item ${isOwned ? "owned" : ""}`}
                            tabIndex={0}
                            title={`${item.name} · ${item.cost.toLocaleString()} souls${isOwned ? " · Owned" : ""}\n${item.description}`}
                          >
                            <div className="build-art">
                              <ItemIcon item={item} />
                              {isOwned && <span className="owned-mark">✓</span>}
                            </div>
                            <strong>{item.name}</strong>
                            <small>
                              {isOwned
                                ? "OWNED"
                                : `${item.cost.toLocaleString()} souls`}
                            </small>
                          </div>
                        ) : (
                          <div
                            key={`${itemId}:${i}`}
                            className="build-item"
                            title={`Unknown item #${itemId}`}
                          >
                            <strong>Item #{itemId}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="build-source">
                Last 30 days · ranked + unranked · build selected at match
                start. Results span build versions; purchases may differ.{" "}
                <a
                  href="https://api.deadlock-api.com/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  Deadlock API ↗
                </a>
              </p>
            </>
          ) : (
            <p className="build-empty" role="status">
              {!hero
                ? "Select a hero to see its build."
                : (error ?? "Loading build and its match statistics…")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
