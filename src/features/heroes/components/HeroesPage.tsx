import { useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate, Route } from "@/app/navigation";
import { useAsync } from "@/shared/api/useAsync";
import { catalog } from "@/shared/catalog";
import { PageTitle } from "@/shared/ui/PageTitle";
import { sortRows } from "@/shared/utils/sort";
import { fetchHeroSummaries } from "../services/hero-analytics";
import type { AnalyticsQuery } from "../utils/analytics";
import { HeroDetail } from "./HeroDetail";
import { HeroGrid, type HeroCard } from "./HeroGrid";
import { RoleButtons, type RoleFilter } from "./TierList";

function HeroRoster({
  role,
  setRole,
  search,
  setSearch,
}: {
  role: RoleFilter;
  setRole(role: RoleFilter): void;
  search: string;
  setSearch(search: string): void;
}) {
  const summaries = useAsync(() => fetchHeroSummaries({ minBadge: 0 }), []);
  const summaryById = new Map(summaries.data?.map((s) => [s.heroId, s]));
  const needle = search.trim().toLowerCase();
  const cards: HeroCard[] = sortRows(
    catalog.heroes
      .filter((hero) => role === "all" || hero.role === role)
      .filter((hero) => hero.name.toLowerCase().includes(needle))
      .map((hero) => {
        const summary = summaryById.get(hero.id);
        return {
          heroId: hero.id,
          name: hero.name,
          image: hero.image,
          winRate: summary?.winRate ?? null,
          pickRate: summary?.pickRate ?? null,
        };
      }),
    "name",
    "asc",
  );
  return (
    <section className="heroes-page">
      <PageTitle title="The Heroes" ribbon="Every hero in the city" />
      <p className="page-lede">
        Browse the full roster. Click a hero for their builds, counters and
        matchups.
      </p>
      <div className="heroes-toolbar">
        <input
          type="search"
          aria-label="Search heroes"
          placeholder="Search heroes"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <RoleButtons value={role} onChange={setRole} />
      </div>
      {summaries.error && (
        <p className="notice warning" role="status">
          Hero stats unavailable: {summaries.error}
          <button type="button" onClick={summaries.retry}>
            Retry
          </button>
        </p>
      )}
      <HeroGrid cards={cards} variant="roster" />
    </section>
  );
}

const NO_HEROES: number[] = [];

export function HeroesPage({
  route,
  navigate,
  query,
  setQuery,
  liveEnemies = NO_HEROES,
  liveAllies = NO_HEROES,
}: {
  route: Route;
  navigate: Navigate;
  query: AnalyticsQuery;
  setQuery(query: AnalyticsQuery): void;
  catalogWhileLoading?: boolean;
  // Each team's heroes in the desktop app's live match; the website has none.
  liveEnemies?: number[];
  liveAllies?: number[];
}) {
  const [role, setRole] = useState<RoleFilter>("all");
  const [search, setSearch] = useState("");
  // Kept here so the same enemy team carries over from hero to hero.
  const [enemyPicks, setEnemyPicks] = useState<number[]>([]);
  return (
    <LinkScope navigate={navigate}>
      {route.heroId === undefined ? (
        <HeroRoster {...{ role, setRole, search, setSearch }} />
      ) : (
        <HeroDetail
          key={route.heroId}
          heroId={route.heroId}
          query={query}
          setQuery={setQuery}
          liveEnemies={liveEnemies}
          liveAllies={liveAllies}
          enemyPicks={enemyPicks}
          setEnemyPicks={setEnemyPicks}
        />
      )}
    </LinkScope>
  );
}
