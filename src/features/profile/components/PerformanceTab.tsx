import { useState } from "react";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import {
  fetchGameAverages,
  fetchMatchTotals,
} from "../services/performance-api";
import type { HistoryMatch } from "../types";
import { timeAgo } from "../utils/format";
import type { PlayerTotals } from "../utils/match-totals";
import {
  PERFORMANCE_METRICS,
  RANGES,
  gameTotals,
  gamesInRange,
  heroChoices,
  summarizeMetric,
  type GameAverage,
  type GamePoint,
  type MetricSummary,
  type PerformanceMetric,
  type PerformanceRange,
} from "../utils/performance-metrics";
import { Sparkline } from "./Sparkline";

const heroName = (heroId: number) =>
  heroById.get(heroId)?.name ?? `Hero ${heroId}`;

const count = (games: number) =>
  `${games.toLocaleString("en-US")} ${games === 1 ? "game" : "games"}`;

const format = (metric: PerformanceMetric, value: number) =>
  metric.percent
    ? `${Math.round(value * 100)}%`
    : value >= 100
      ? Math.round(value).toLocaleString("en-US")
      : value.toFixed(1);

const TRENDS = {
  improving: ["▲", "Improving"],
  flat: ["–", "Flat"],
  slipping: ["▼", "Slipping"],
};

function PerformanceCard({
  summary,
  totals,
  averages,
}: {
  summary: MetricSummary;
  totals: AsyncState<unknown>;
  averages: AsyncState<unknown>;
}) {
  const { metric, value, games, average, comparedValue, compared, trend } =
    summary;
  // What the card still waits for, or lacks because a request failed.
  const waiting =
    (metric.needsTotals && totals.loading) ||
    (!!metric.average && averages.loading);
  const failed =
    (metric.needsTotals && !!totals.error) ||
    (!!metric.average && !!averages.error);
  const detail =
    metric.needsTotals && totals.loading
      ? "Loading match details…"
      : !games
        ? "No match details"
        : count(games) +
          (!metric.average
            ? " · no rank average"
            : averages.loading
              ? " · loading rank average…"
              : average === null
                ? averages.error
                  ? ""
                  : " · no rank average for these games"
                : compared < games
                  ? // Like with like: the player over the same games.
                    ` · ${compared} with a rank average: ${format(metric, comparedValue!)} vs ${format(metric, average)}`
                  : ` · rank avg ${format(metric, average)}`);
  // No badge while what the trend needs loads or failed, or when no game
  // has a rank average to follow.
  const tooFew =
    !trend &&
    !waiting &&
    !failed &&
    games > 0 &&
    (!metric.average || average !== null);
  const title = (p: GamePoint) =>
    `${heroName(p.heroId)} · ${p.won ? "Win" : "Loss"} · ${timeAgo(p.startTime * 1000)}: ` +
    format(metric, p.value!) +
    (p.average === null ? "" : ` (rank avg ${format(metric, p.average)})`);
  return (
    <section className="perf-card" aria-label={metric.label}>
      <div className="perf-card-head">
        <h3>{metric.label}</h3>
        {trend && (
          <span className={`perf-trend ${trend}`}>
            <span aria-hidden="true">{TRENDS[trend][0]}</span>{" "}
            {TRENDS[trend][1]}
          </span>
        )}
        {tooFew && <span className="perf-trend">Too few games</span>}
      </div>
      <div className="perf-card-numbers">
        <b>{value === null ? "—" : format(metric, value)}</b>{" "}
        <span>{detail}</span>
      </div>
      {games > 0 && (
        <Sparkline
          points={summary.points}
          label={`${metric.label}, game by game`}
          title={title}
        />
      )}
    </section>
  );
}

/** The one-line notes on how the numbers are made, as they apply. */
function notes(
  accountId: number,
  games: HistoryMatch[],
  totals: Map<number, PlayerTotals[]> | undefined,
  averages: Map<number, GameAverage> | undefined,
) {
  const lines = [
    "Normal and ranked games, oldest on the left. The rank average is the average player on the same hero at the same rank and match length, over the last 30 days.",
    "Improving or slipping compares the recent half of these games with the earlier half, each against its rank average where there is one. Changes smaller than game-to-game noise show as flat.",
    "Creep kills stand in for last hits, which the rank average doesn't have. Kill participation and the hero damage, objective damage and healing shares have no rank average, as it has no team totals.",
  ];
  const sources = new Set([...(averages?.values() ?? [])].map((a) => a.source));
  if (sources.has("current"))
    lines.push("Games without a recorded rank use the player's current rank.");
  if (sources.has("none"))
    lines.push(
      "Games without a recorded rank, and no current rank to use, are compared with all ranks.",
    );
  if ([...(averages?.values() ?? [])].some((a) => a.widenedFrom))
    lines.push(
      "Where a hero has too few games at one rank, its average covers the ranks either side.",
    );
  // Not stored yet, or stored without the player.
  const missing = totals
    ? games.filter((g) => !gameTotals(totals.get(g.matchId), accountId)).length
    : 0;
  if (missing)
    lines.push(
      `${missing} of ${games.length} games have no match details yet, so they're missing from damage, healing, creep kills and shares.`,
    );
  return lines;
}

export function PerformanceTab({
  accountId,
  history,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
}) {
  const [range, setRange] = useState<PerformanceRange>(20);
  const [picked, setPicked] = useState<number | null>(null);
  const matches = history.data ?? [];
  const heroes = heroChoices(matches);
  // All heroes when the picked one has no games (left the history).
  const heroId = heroes.some((h) => h.heroId === picked) ? picked : null;
  const games = gamesInRange(matches, range, heroId);
  const key = games.map((g) => g.matchId).join(",");
  const totals = useAsync(
    games.length ? () => fetchMatchTotals(games.map((g) => g.matchId)) : null,
    [key],
  );
  const averages = useAsync(
    games.length ? () => fetchGameAverages(accountId, games) : null,
    [accountId, key],
  );
  const summaries = PERFORMANCE_METRICS.map((metric) =>
    summarizeMetric(
      metric,
      games,
      (id) => gameTotals(totals.data?.get(id), accountId),
      (id) => averages.data?.get(id),
    ),
  );
  return (
    <div className="performance">
      <SectionHeader title="Performance" />
      <div className="section-head">
        <div className="filter-buttons" role="group" aria-label="Range">
          {RANGES.map((value) => (
            <button
              key={value}
              className={range === value ? "active" : ""}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              Last {value}
            </button>
          ))}
        </div>
        {heroes.length > 1 && (
          <label className="select-field">
            Hero
            <select
              value={heroId ?? ""}
              onChange={(event) =>
                setPicked(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
            >
              <option value="">All heroes</option>
              {heroes.map((hero) => (
                <option key={hero.heroId} value={hero.heroId}>
                  {heroName(hero.heroId)} · {count(hero.games)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {history.loading && <p className="muted">Loading match history…</p>}
      {history.error && (
        <p className="notice warning" role="status">
          Match history unavailable
          <button type="button" onClick={history.retry}>
            Retry
          </button>
        </p>
      )}
      {history.data && !games.length && (
        <p className="muted">No recorded normal or ranked matches</p>
      )}
      {!!games.length && (
        <>
          {totals.error && (
            <p className="notice warning" role="status">
              Match details unavailable: {totals.error}
              <button type="button" onClick={totals.retry}>
                Retry
              </button>
            </p>
          )}
          {averages.error && (
            <p className="notice warning" role="status">
              Rank averages unavailable: {averages.error}
              <button type="button" onClick={averages.retry}>
                Retry
              </button>
            </p>
          )}
          <div className="performance-legend" aria-hidden="true">
            <span>
              <i className="value" />
              Game by game
            </span>
            <span>
              <i className="average" />
              Average for that hero at that rank
            </span>
            <span>
              <i className="win" />
              Win
            </span>
            <span>
              <i className="loss" />
              Loss
            </span>
          </div>
          <div className="perf-cards">
            {summaries.map((summary) => (
              <PerformanceCard
                key={summary.metric.id}
                {...{ summary, totals, averages }}
              />
            ))}
          </div>
          {notes(accountId, games, totals.data, averages.data).map((line) => (
            <p key={line} className="data-note">
              {line}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
