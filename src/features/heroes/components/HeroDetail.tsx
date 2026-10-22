import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { RouteLink } from "@/app/links";
import { useAsync, type AsyncState } from "@/shared/api/useAsync";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { heroById, itemById } from "@/shared/catalog";
import { MainBuild } from "@/features/builds/components/MainBuild";
import { PopularBuilds } from "@/features/builds/components/PopularBuilds";
import { fetchMainBuild } from "@/features/builds/services/main-build";
import { fetchPopularBuilds } from "@/features/builds/services/popular-builds";
import { CounterItems } from "@/features/counters/components/CounterItems";
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
  rankLabel,
  type AnalyticsQuery,
  type ItemPerf,
} from "../utils/analytics";
import { HeroHeader } from "./HeroHeader";
import { ItemList, type ItemEntry } from "./ItemList";
import { MatchupList } from "./MatchupList";
import { SkillOrder } from "./SkillOrder";

const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const TABS = [
  { key: "build", label: "Build" },
  { key: "popular", label: "Popular builds" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

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
  size,
  children,
}: {
  title: string;
  meta?: string;
  size?: "half" | "wide";
  children: ReactNode;
}) {
  return (
    <section className={`detail-section ${size ?? ""}`.trim()}>
      <SectionHeader
        title={title}
        action={meta && <span className="section-meta">{meta}</span>}
      />
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
  setQuery,
  liveEnemies,
  enemyPicks,
  setEnemyPicks,
}: {
  heroId: number;
  query: AnalyticsQuery;
  setQuery(query: AnalyticsQuery): void;
  liveEnemies: number[];
  enemyPicks: number[];
  setEnemyPicks(picks: number[]): void;
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
  const build = useAsync(() => fetchMainBuild(heroId, query), deps);
  const popular = useAsync(() => fetchPopularBuilds(heroId), [heroId]);
  // Counter items leave out what the main build already lists.
  const exclude = useMemo(
    () =>
      new Set(
        build.data?.flatMap((phase) => phase.items.map((item) => item.itemId)),
      ),
    [build.data],
  );
  const tabsId = useId();
  const [tab, setTab] = useState<TabKey>("build");
  const tabId = (key: TabKey) => `${tabsId}-${key}-tab`;
  const panelId = (key: TabKey) => `${tabsId}-${key}-panel`;
  // Roving focus: arrows wrap, Home and End jump to the ends.
  const onTabKey = (event: KeyboardEvent, index: number) => {
    // Leave browser shortcuts such as Alt+ArrowLeft (Back) alone.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const last = TABS.length - 1;
    const moves: Partial<Record<string, number>> = {
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowRight: index === last ? 0 : index + 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(TABS[next].key);
    document.getElementById(tabId(TABS[next].key))?.focus();
  };
  const popularCount = popular.data?.builds.length ?? 0;

  if (!hero)
    return (
      <div className="hero-detail">
        <RouteLink className="hero-back" route={{ page: "heroes" }}>
          ← All heroes
        </RouteLink>
        <p className="muted">Hero not found.</p>
      </div>
    );

  const summary = summaries.data?.find((row) => row.heroId === heroId);
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
      <HeroHeader
        hero={hero}
        summary={summary}
        query={query}
        setQuery={setQuery}
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
        <div className="build-tabs" role="tablist" aria-label="Builds">
          {TABS.map(({ key, label }, index) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={tabId(key)}
              aria-selected={tab === key}
              aria-controls={panelId(key)}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              {label}
              {key === "popular" && popularCount > 0 && (
                <>
                  {" "}
                  <small className="tab-count">{popularCount}</small>
                </>
              )}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={panelId("build")}
          aria-labelledby={tabId("build")}
          className="build-tab-panel"
          hidden={tab !== "build"}
        >
          <p className="data-note">
            Most-bought items in each phase · {rankLabel(query.minBadge)} · last
            30 days · win rate under each item
          </p>
          <MainBuild state={build} />
        </div>
        <div
          role="tabpanel"
          id={panelId("popular")}
          aria-labelledby={tabId("popular")}
          className="build-tab-panel"
          hidden={tab !== "popular"}
        >
          <PopularBuilds state={popular} />
        </div>
        <Section title="Counter items">
          <CounterItems
            hero={hero}
            query={query}
            picks={enemyPicks}
            setPicks={setEnemyPicks}
            liveEnemies={liveEnemies}
            exclude={exclude}
          />
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
        <div className="detail-grid">
          <Section title="Strong against">
            <Body state={counters} empty={strong.length === 0}>
              <MatchupList rows={strong} />
            </Body>
          </Section>
          <Section title="Countered by">
            <Body state={counters} empty={weak.length === 0}>
              <MatchupList rows={weak} />
            </Body>
          </Section>
          <Section title="Best with">
            <Body state={synergy} empty={partners.length === 0}>
              <MatchupList rows={partners} />
            </Body>
          </Section>
          <Section title="Best items" size="half">
            <Body state={merge(heroItems, summaries)} empty={best.length === 0}>
              <ItemList entries={best} />
              <p className="data-note">
                Expensive items show higher win rates partly because players who
                are ahead can afford them.
              </p>
            </Body>
          </Section>
          <Section title={`Items that beat ${hero.name}`} size="half">
            <Body
              state={{ ...counterState, error: undefined }}
              empty={counterEntries.length === 0}
            >
              <ItemList entries={counterEntries} />
              <p className="data-note">
                {fallback
                  ? "Based on hero traits"
                  : "Win rate against this hero compared with the item's overall win rate, adjusted for the hero's overall win rate."}
              </p>
            </Body>
          </Section>
        </div>
        <p className="data-note">
          Last 30 days, ranked and unranked. Matchups and pairings need at least
          200 games.
        </p>
      </div>
    </div>
  );
}
