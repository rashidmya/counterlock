import { useMemo, type ReactNode } from "react";
import type { Navigate } from "@/app/navigation";
import { useAsync, type AsyncState } from "@/shared/api/useAsync";
import { catalog, heroById, itemById } from "@/shared/catalog";
import {
  fetchAbilityOrder,
  fetchHeroSummaries,
  fetchItemStats,
  fetchMatchups,
  fetchSynergy,
  heuristicCounterItems,
} from "../services/hero-analytics";
import {
  bestItems,
  bestWith,
  counterItems,
  matchups,
  mostCommonOrder,
  type AnalyticsQuery,
  type ItemPerf,
} from "../utils/analytics";
import { AbilityCards } from "./AbilityCards";
import { HeroBuild } from "./HeroBuild";
import { HeroHeader } from "./HeroHeader";
import { ItemList, type ItemEntry } from "./ItemList";
import { MatchupList } from "./MatchupList";
import { SkillOrder } from "./SkillOrder";

const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const merge = (...states: AsyncState<unknown>[]) => ({
  loading: states.some((state) => state.loading),
  error: states.find((state) => state.error)?.error,
  retry: () =>
    states.forEach((state) => {
      if (state.error) state.retry();
    }),
});

function Section({
  title,
  meta,
  wide,
  children,
}: {
  title: string;
  meta?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`detail-section ${wide ? "wide" : ""}`}>
      <div className="detail-heading">
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function Body({
  state,
  empty,
  children,
}: {
  state: { loading: boolean; error?: string; retry(): void };
  empty: boolean;
  children: ReactNode;
}) {
  if (state.loading) return <p className="muted">Loading…</p>;
  if (state.error)
    return (
      <p className="muted">
        Unavailable: {state.error}{" "}
        <button type="button" className="retry" onClick={state.retry}>
          Retry
        </button>
      </p>
    );
  if (empty) return <p className="muted">Not enough data</p>;
  return <>{children}</>;
}

const perfEntries = (
  list: ItemPerf[],
  describe: (perf: ItemPerf) => { value: string; note: string },
): ItemEntry[] =>
  list.flatMap((perf) => {
    const item = itemById.get(perf.itemId);
    return item ? [{ item, ...describe(perf) }] : [];
  });

export function HeroDetail({
  heroId,
  query,
  navigate,
}: {
  heroId: number;
  query: AnalyticsQuery;
  navigate: Navigate;
}) {
  const hero = heroById.get(heroId);
  const deps = [heroId, query.minBadge];
  const summaries = useAsync(() => fetchHeroSummaries(query), [query.minBadge]);
  const counters = useAsync(() => fetchMatchups(query), [query.minBadge]);
  const synergy = useAsync(() => fetchSynergy(query), [query.minBadge]);
  const order = useAsync(() => fetchAbilityOrder(heroId, query), deps);
  const heroItems = useAsync(
    () => fetchItemStats(query, `hero_id=${heroId}`),
    deps,
  );
  const versus = useAsync(
    () => fetchItemStats(query, `enemy_hero_ids=${heroId}`),
    deps,
  );
  const baseline = useAsync(() => fetchItemStats(query), [query.minBadge]);
  const heuristic = useMemo(() => heuristicCounterItems(heroId), [heroId]);

  if (!hero)
    return (
      <div className="hero-detail">
        <button type="button" onClick={() => navigate({ page: "heroes" })}>
          ← All heroes
        </button>
        <p className="muted">Hero not found.</p>
      </div>
    );

  const summary = summaries.data?.find((row) => row.heroId === heroId);
  const openHero = (id: number) => navigate({ page: "heroes", heroId: id });
  const openItem = (itemId: number) => navigate({ page: "items", itemId });
  const abilityIds = hero.abilityIds ?? [];

  const pairs = matchups(counters.data ?? [], heroId);
  const strong = pairs.strong.filter((row) => row.winRate > 0.5);
  const weak = pairs.weak.filter((row) => row.winRate < 0.5);
  const partners = bestWith(synergy.data ?? [], heroId);
  const common = mostCommonOrder(order.data ?? []);

  const best = perfEntries(
    bestItems(heroItems.data ?? [], summary?.matches ?? 0),
    (perf) => ({
      value: percent(perf.winRate),
      note: `${percent(perf.pickRate ?? 0)} pick`,
    }),
  );
  const measured = perfEntries(
    counterItems(versus.data ?? [], baseline.data ?? []),
    (perf) => ({
      value: `+${percent(perf.delta ?? 0)}`,
      note: `${percent(perf.winRate)} win`,
    }),
  );
  const fallback = measured.length === 0;
  const counterEntries: ItemEntry[] = fallback
    ? heuristic.slice(0, 6).map((item) => ({
        item,
        note: `${item.cost.toLocaleString()} souls`,
      }))
    : measured;
  const counterState = merge(versus, baseline);

  return (
    <div className="hero-detail">
      <div className="hero-detail-card">
        <HeroHeader
          hero={hero}
          summary={summary}
          total={catalog.heroes.length}
          navigate={navigate}
        />
        {summaries.error && (
          <p className="notice warning" role="status">
            Hero stats unavailable: {summaries.error}
            <button type="button" onClick={summaries.retry}>
              Retry
            </button>
          </p>
        )}
        <div className="hero-detail-body">
          <Section title="Abilities">
            <AbilityCards abilityIds={abilityIds} />
          </Section>
          <Section
            title="Skill order"
            meta={
              common
                ? `MOST COMMON · ${percent(common.winRate)} WIN RATE · ${common.matches.toLocaleString()} GAMES`
                : undefined
            }
          >
            <Body state={order} empty={!common}>
              {common && (
                <SkillOrder abilityIds={abilityIds} order={common.abilities} />
              )}
            </Body>
          </Section>
          <Section title="Build" meta="MOST-PLAYED COMMUNITY BUILD">
            <HeroBuild heroId={heroId} />
          </Section>
          <div className="detail-grid">
            <Section title="Strong against">
              <Body state={counters} empty={strong.length === 0}>
                <MatchupList rows={strong} onOpen={openHero} />
              </Body>
            </Section>
            <Section title="Countered by">
              <Body state={counters} empty={weak.length === 0}>
                <MatchupList rows={weak} onOpen={openHero} />
              </Body>
            </Section>
            <Section title="Best with">
              <Body state={synergy} empty={partners.length === 0}>
                <MatchupList rows={partners} onOpen={openHero} />
              </Body>
            </Section>
            <Section title="Best items">
              <Body
                state={merge(heroItems, summaries)}
                empty={best.length === 0}
              >
                <ItemList entries={best} onOpen={openItem} />
                <p className="data-note">
                  Expensive items show higher win rates partly because players
                  who are ahead can afford them.
                </p>
              </Body>
            </Section>
            <Section title="Counter items" wide>
              <Body
                state={{ ...counterState, error: undefined }}
                empty={counterEntries.length === 0}
              >
                <ItemList entries={counterEntries} onOpen={openItem} />
                <p className="data-note">
                  {fallback
                    ? "Based on hero traits"
                    : "Win rate against this hero compared with the item's overall win rate, adjusted for the hero's overall win rate."}
                </p>
              </Body>
            </Section>
          </div>
          <p className="data-note">
            Last 30 days, ranked and unranked. Matchups and pairings need at
            least 200 games.
          </p>
        </div>
      </div>
    </div>
  );
}
