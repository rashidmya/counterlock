import { useState } from "react";
import { useAsync } from "@/shared/api/useAsync";
import { Picture } from "@/shared/ui/Picture";
import {
  rankLabel,
  type AnalyticsQuery,
} from "@/features/heroes/utils/analytics";
import { fetchMainBuild } from "../services/main-build";
import { buildPhase } from "../utils/main-build";
import { MainBuild } from "./MainBuild";
import type { Catalog } from "@/shared/catalog/types";
import type { MatchState } from "@/features/match/types";

export function BuildPanel({
  catalog,
  state,
  query,
}: {
  catalog: Catalog;
  state: MatchState;
  query: AnalyticsQuery;
}) {
  const [selection, setSelection] = useState("local");
  const [expanded, setExpanded] = useState(true);
  const local = state.players.find((p) => p.local);
  const id = selection === "local" ? local?.heroId : Number(selection);
  const hero = catalog.heroes.find((h) => h.id === id);
  const brawl = state.gameMode === "street_brawl";
  const build = useAsync(
    hero && !brawl ? () => fetchMainBuild(hero.id, query) : null,
    [hero?.id, query.minBadge, brawl],
  );
  const owned = local && local.heroId === id ? local.items : [];
  const rank = rankLabel(query.minBadge);
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
            <p className="eyebrow">MOST-BOUGHT ITEMS · {rank}</p>
            <h2>
              Your build <span>{hero?.name ?? "Choose a hero"}</span>
            </h2>
          </div>
        </div>
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
          {brawl ? (
            <p className="build-empty" role="status">
              Build statistics for Street Brawl are unavailable.
            </p>
          ) : !hero ? (
            <p className="build-empty" role="status">
              Select a hero to see its build.
            </p>
          ) : (
            <>
              <MainBuild
                state={build}
                owned={owned}
                now={buildPhase(state.clock)}
              />
              <p className="build-source">
                Most-bought items in each phase · {rank} · last 30 days · win
                rate under each item. Same build as the hero page.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
