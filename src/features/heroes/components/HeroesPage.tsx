import { useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate, Route } from "@/app/navigation";
import { useAsync } from "@/shared/api/useAsync";
import { catalog } from "@/shared/catalog";
import { sortRows } from "@/shared/utils/sort";
import { fetchHeroSummaries } from "../services/hero-analytics";
import type { AnalyticsQuery, Tier } from "../utils/analytics";
import { HeroDetail } from "./HeroDetail";
import { HeroGrid, type HeroCard } from "./HeroGrid";
import { RankFilter } from "./RankFilter";

type RoleFilter = "all" | "assassin" | "brawler" | "marksman" | "mystic";
type SortMode = "tier" | "name" | "winRate" | "pickRate";

const roles: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "assassin", label: "Assassin" },
  { value: "brawler", label: "Brawler" },
  { value: "marksman", label: "Marksman" },
  { value: "mystic", label: "Mystic" },
];
const sorts: { value: SortMode; label: string }[] = [
  { value: "tier", label: "Tier" },
  { value: "name", label: "A–Z" },
  { value: "winRate", label: "Win rate" },
  { value: "pickRate", label: "Pick rate" },
];
const tiers: Tier[] = ["S", "A", "B", "C", "D"];

export function HeroesPage({
  route,
  navigate,
  query,
  setQuery,
}: {
  route: Route;
  navigate: Navigate;
  query: AnalyticsQuery;
  setQuery(query: AnalyticsQuery): void;
}) {
  const [role, setRole] = useState<RoleFilter>("all");
  const [sort, setSort] = useState<SortMode>("tier");
  const summaries = useAsync(() => fetchHeroSummaries(query), [query.minBadge]);
  if (route.heroId !== undefined)
    return (
      <LinkScope navigate={navigate}>
        <HeroDetail key={route.heroId} heroId={route.heroId} query={query} />
      </LinkScope>
    );

  const summaryById = new Map(summaries.data?.map((s) => [s.heroId, s]));
  const cards: HeroCard[] = catalog.heroes
    .filter((hero) => role === "all" || hero.role === role)
    .map((hero) => {
      const summary = summaryById.get(hero.id);
      return {
        heroId: hero.id,
        name: hero.name,
        image: hero.image,
        winRate: summary?.winRate ?? null,
        pickRate: summary?.pickRate ?? null,
        tier: summary?.tier,
      };
    });
  const groups: { label: string; cards: HeroCard[] }[] =
    sort === "tier"
      ? [
          ...tiers.map((tier) => ({
            label: `${tier} TIER`,
            cards: sortRows(
              cards.filter((card) => card.tier === tier),
              "winRate",
              "desc",
            ),
          })),
          {
            label: summaries.error ? "NO DATA" : "UNRANKED",
            cards: sortRows(
              cards.filter((card) => !card.tier),
              "name",
              "asc",
            ),
          },
        ].filter((group) => group.cards.length)
      : [
          {
            label: "",
            cards: sortRows(cards, sort, sort === "name" ? "asc" : "desc"),
          },
        ];
  return (
    <LinkScope navigate={navigate}>
      <section className="heroes-page">
        <div className="heroes-toolbar">
          <div className="filter-buttons" role="group" aria-label="Role">
            {roles.map((option) => (
              <button
                key={option.value}
                className={role === option.value ? "active" : ""}
                aria-pressed={role === option.value}
                onClick={() => setRole(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="heroes-selects">
            <label className="select-field">
              Sort
              <select
                aria-label="Sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
              >
                {sorts.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <RankFilter
              value={query.minBadge}
              onChange={(minBadge) => setQuery({ ...query, minBadge })}
            />
          </div>
        </div>
        {summaries.loading && <p className="muted">Loading hero stats…</p>}
        {summaries.error && (
          <p className="notice warning" role="status">
            Hero stats unavailable: {summaries.error}
            <button type="button" onClick={summaries.retry}>
              Retry
            </button>
          </p>
        )}
        {!summaries.loading &&
          groups.map((group) => (
            <div key={group.label} className="hero-group">
              {group.label && <h2 className="tier-heading">{group.label}</h2>}
              <HeroGrid cards={group.cards} />
            </div>
          ))}
        {summaries.data && (
          <p className="data-note">Tiers are based on win rate.</p>
        )}
      </section>
    </LinkScope>
  );
}
