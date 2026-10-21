import { useState } from "react";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { LineChart } from "@/shared/ui/LineChart";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { fetchSummaryHeroStats } from "../services/profile-api";
import type { HistoryMatch } from "../types";
import {
  combatAverages,
  performanceSeries,
  type PerformanceRange,
} from "../utils/performance";

const ranges: { value: PerformanceRange; label: string }[] = [
  { value: 20, label: "Last 20" },
  { value: 50, label: "Last 50" },
  { value: "all", label: "All" },
];

const NONE = "—";
const whole = (value: number) => Math.round(value).toLocaleString("en-US");

export function PerformanceTab({
  accountId,
  history,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
}) {
  const [range, setRange] = useState<PerformanceRange>(20);
  const stats = useAsync(() => fetchSummaryHeroStats(accountId), [accountId]);
  const matches = history.data;
  const series = performanceSeries(matches ?? [], range);
  const combat = stats.data ? combatAverages(stats.data) : null;
  const { averages } = series;
  const cards = [
    {
      label: "ACCURACY",
      value: combat ? `${(combat.accuracy * 100).toFixed(1)}%` : NONE,
    },
    {
      label: "DMG/MIN",
      value: combat ? whole(combat.damagePerMin) : NONE,
    },
    { label: "LAST HITS", value: averages.avgLastHits.toFixed(1) },
    { label: "DEATHS", value: averages.avgDeaths.toFixed(1) },
  ];
  return (
    <div className="performance">
      <SectionHeader title="Performance" />
      <div className="section-head">
        <div className="filter-buttons" role="group" aria-label="Range">
          {ranges.map(({ value, label }) => (
            <button
              key={label}
              className={range === value ? "active" : ""}
              aria-pressed={range === value}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
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
      {matches && !averages.games && (
        <p className="muted">No recorded normal or ranked matches</p>
      )}
      {!!averages.games && (
        <>
          <p className="data-note">Normal & ranked games</p>
          <section className="chart-card">
            <small>KDA PER MATCH</small>
            <LineChart
              values={series.kda}
              average={averages.kda}
              label="KDA per match"
              color="var(--gold)"
            />
          </section>
          <section className="chart-card">
            <small>SOULS PER MINUTE</small>
            <LineChart
              values={series.soulsPerMin}
              average={averages.soulsPerMin}
              label="Souls per minute"
              color="var(--good)"
            />
          </section>
          <section className="chart-card">
            <small>FORM · LAST {series.form.length}</small>
            <div className="form">
              {series.form.map((won, index) => (
                <i key={index} className={won ? "win" : "loss"} />
              ))}
            </div>
          </section>
          <div className="stat-row">
            {cards.map(({ label, value }) => (
              <div key={label} className="stat-card">
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="data-note">
            Last hits and deaths are per-game averages for the selected range.
            {range !== "all" &&
              " Accuracy and damage cover all normal & ranked games in the period."}
          </p>
        </>
      )}
    </div>
  );
}
