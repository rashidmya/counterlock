import { useLayoutEffect, useRef, useState } from "react";
import { heroById, itemById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import { clock } from "../utils/format";
import {
  ITEM_MARKER_COST,
  TIME_RANGES,
  averageSeries,
  formatValue,
  leadSeries,
  playerSeries,
  rangeAvailable,
  rangeOf,
  ranking,
  rankingTitle,
  teamSeries,
  type ShowMode,
  type TimeRange,
  type ValueMode,
} from "../utils/graph";
import { METRICS, metricById, type MetricId } from "../utils/metrics";
import { displayName, heroName, isMe, optionLabel } from "../utils/perspective";
import type { RankCurve } from "../utils/rank-curve";
import {
  TEAM_NAMES,
  type MatchReport,
  type ReportPlayer,
  type Team,
} from "../utils/report";
import { GraphChart, type ChartLine, type Markers } from "./GraphChart";

const SHOW: { id: ShowMode; label: string }[] = [
  { id: "player", label: "Player vs avg" },
  { id: "teams", label: "Team totals" },
  { id: "lead", label: "Team lead" },
  { id: "everyone", label: "Everyone" },
];
const VALUES: { id: ValueMode; label: string }[] = [
  { id: "total", label: "Total" },
  { id: "perMinute", label: "Per minute" },
];
// Six shades per team: Amber in blues, Sapphire in reds (spec).
const SHADES = [100, 62, 84, 46, 92, 70];
const teamColor = (team: Team) => (team === 0 ? "var(--ally)" : "var(--enemy)");
const shade = (team: Team, index: number) =>
  `color-mix(in srgb, ${teamColor(team)} ${SHADES[index % SHADES.length]}%, var(--cream))`;
const FOOT =
  "Snapshots every 3 min until 15:00, then every 5 min; lines connect them.";

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = () => false,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange(value: T): void;
  disabled?(id: T): boolean;
}) {
  return (
    <div className="graph-filter" role="group" aria-label={label}>
      <small>{label}</small>
      <span className="segmented">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            disabled={disabled(option.id)}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </span>
    </div>
  );
}

export function ReportGraph({
  report,
  names,
  meId,
  selected,
  curve,
  onSelect,
}: {
  report: MatchReport;
  names: Map<number, string>;
  meId: number | null;
  selected?: ReportPlayer;
  curve: RankCurve | null;
  onSelect(slot: number): void;
}) {
  const [metricId, setMetricId] = useState<MetricId>("souls");
  const [show, setShow] = useState<ShowMode>("player");
  const [values, setValues] = useState<ValueMode>("total");
  const [range, setRange] = useState<TimeRange>("all");
  const [marks, setMarks] = useState({
    deaths: true,
    items: true,
    objectives: true,
  });
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = chartRef.current;
    if (!node) return;
    const measure = () => setWidth(Math.round(node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const metric = metricById.get(metricId)!;
  // Matches before 2026-09-29 have no buff pickup times, so no buffs line.
  const metrics = METRICS.filter(
    (m) => m.id !== "permanentBuffs" || report.buffsTimed,
  );
  // Without a selected player, "Player vs avg" falls back to everyone.
  const mode: ShowMode = show === "player" && !selected ? "everyone" : show;
  const [t0, t1] = rangeOf(range, report.durationS);
  const colors = new Map(
    ([0, 1] as Team[]).flatMap((team) =>
      report.players
        .filter((p) => p.team === team)
        .map((p, index) => [p.slot, shade(team, index)] as const),
    ),
  );
  const colorOf = (p: ReportPlayer) =>
    p.slot === selected?.slot ? "var(--gold)" : colors.get(p.slot)!;
  const lineName = (p: ReportPlayer) =>
    isMe(p, meId)
      ? "You"
      : `${heroName(p.heroId)} · ${displayName(p, names, meId)}`;
  let lines: ChartLine[];
  if (mode === "player" && selected)
    lines = [
      {
        key: `p${selected.slot}`,
        label: lineName(selected),
        color: "var(--gold)",
        focus: true,
        points: playerSeries(selected, metric, values),
      },
    ];
  else if (mode === "teams")
    lines = ([0, 1] as Team[]).map((team) => ({
      key: `t${team}`,
      label: TEAM_NAMES[team],
      color: teamColor(team),
      focus: true,
      points: teamSeries(report.players, team, metric, values),
    }));
  else if (mode === "lead")
    lines = [
      {
        key: "lead",
        label: "Amber lead",
        color: "var(--gold)",
        focus: true,
        points: leadSeries(report.players, metric, values),
      },
    ];
  else
    lines = report.players
      .filter((p) => !hidden.has(p.slot))
      .map((p) => ({
        key: `p${p.slot}`,
        label: lineName(p),
        color: colorOf(p),
        focus: p.slot === selected?.slot,
        points: playerSeries(p, metric, values),
      }));
  const average =
    mode === "player" && selected
      ? averageSeries(curve, metric, values, report.durationS)
      : null;
  const averageLabel =
    selected && curve
      ? `Avg ${heroName(selected.heroId)} at ${curve.band.label}`
      : "";

  const playerMarks = selected && (mode === "player" || mode === "everyone");
  const who = selected ? displayName(selected, names, meId) : "";
  const markers: Markers = {
    deaths:
      marks.deaths && playerMarks
        ? selected.deathTimes.map((t) => ({
            t,
            title: `${who} died at ${clock(t)}`,
          }))
        : null,
    items:
      marks.items && playerMarks
        ? selected.purchases.flatMap(({ timeS, itemId }) => {
            const item = itemById.get(itemId);
            return item && item.cost >= ITEM_MARKER_COST
              ? [
                  {
                    t: timeS,
                    image: item.image,
                    title: `${item.name} at ${clock(timeS)}`,
                  },
                ]
              : [];
          })
        : null,
    objectives: marks.objectives
      ? [
          ...report.objectives.map(({ timeS, team }) => {
            const by: Team = team === 0 ? 1 : 0;
            return {
              t: timeS,
              team: by,
              boss: false,
              title: `${TEAM_NAMES[by]} destroyed a ${TEAM_NAMES[team]} objective at ${clock(timeS)}`,
            };
          }),
          ...report.midBoss.map(({ timeS, team }) => ({
            t: timeS,
            team,
            boss: true,
            title: `Mid Boss taken by ${TEAM_NAMES[team]} at ${clock(timeS)}`,
          })),
        ]
      : null,
  };

  const ranked = ranking(report.players, metric, values, t1);
  const top = Math.max(...ranked.map((row) => Math.abs(row.value)), 1);
  const notes: Record<ShowMode, string> = {
    player: selected
      ? average
        ? `${isMe(selected, meId) ? "You" : `${who} (${heroName(selected.heroId)})`} vs the average ${heroName(selected.heroId)} at ${curve!.band.label} · shaded band = normal range (±1 standard deviation)`
        : `${who} · no rank average for this stat`
      : "",
    teams: metric.rate ? "Each team's average" : "Each team's combined total",
    lead: "Above the line: Amber ahead. Below: Sapphire ahead",
    everyone:
      "Click a hero below to hide or show their line. Gold = the player you're viewing as",
  };

  return (
    <div className="report-graph">
      <div className="graph-tabs">
        <div className="graph-stat-tabs" role="group" aria-label="Stat">
          {metrics
            .filter((m) => m.main)
            .map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={metricId === m.id}
                onClick={() => setMetricId(m.id)}
              >
                {m.label}
              </button>
            ))}
        </div>
        <select
          aria-label="More stats"
          value={metric.main ? "" : metricId}
          onChange={(event) =>
            event.target.value && setMetricId(event.target.value as MetricId)
          }
        >
          <option value="">More stats…</option>
          {metrics
            .filter((m) => !m.main)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
        </select>
      </div>
      <div className="graph-filters">
        <Segmented<ShowMode>
          label="Show"
          options={SHOW}
          value={mode}
          onChange={setShow}
          disabled={(id) => id === "player" && !selected}
        />
        <Segmented<ValueMode>
          label="Values"
          options={VALUES}
          value={metric.rate ? "total" : values}
          onChange={setValues}
          disabled={(id) => id === "perMinute" && metric.rate}
        />
        <Segmented<TimeRange>
          label="Time"
          options={TIME_RANGES}
          value={range}
          onChange={setRange}
          disabled={(id) => !rangeAvailable(id, report.durationS)}
        />
        <div className="graph-filter" role="group" aria-label="Markers">
          <small>Markers</small>
          {(
            [
              ["deaths", "Deaths"],
              ["items", "Items"],
              ["objectives", "Objectives"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="graph-check">
              <input
                type="checkbox"
                checked={marks[key]}
                onChange={(event) =>
                  setMarks({ ...marks, [key]: event.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="graph-body">
        <div className="graph-chart" ref={chartRef}>
          {width > 0 && (
            <GraphChart
              width={width}
              {...{ lines, average, averageLabel, metric, markers, t0, t1 }}
              lead={mode === "lead"}
              perMinute={values === "perMinute" && !metric.rate}
            />
          )}
        </div>
        <aside className="graph-ranking">
          <h3>{rankingTitle(metric, values, range, t1)}</h3>
          <ol>
            {ranked.map(({ player, value }) => {
              const hero = heroById.get(player.heroId);
              return (
                <li key={player.slot}>
                  <button
                    type="button"
                    className={
                      player.slot === selected?.slot ? "selected" : undefined
                    }
                    aria-label={`View as ${optionLabel(player, names, meId)}`}
                    onClick={() => onSelect(player.slot)}
                  >
                    <Picture
                      className="graph-rank-portrait"
                      src={hero?.cardImage ?? hero?.image}
                      label={heroName(player.heroId)}
                    />
                    <span className="graph-rank-name">
                      {isMe(player, meId) ? "You · " : ""}
                      {heroName(player.heroId)}
                    </span>
                    <span className="graph-rank-bar" aria-hidden="true">
                      <i
                        style={{
                          width: `${(Math.abs(value) / top) * 100}%`,
                          background: colorOf(player),
                        }}
                      />
                    </span>
                    <b>{formatValue(value, metric)}</b>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
      {mode === "everyone" && (
        <div className="graph-legend" role="group" aria-label="Lines">
          {report.players.map((p) => {
            const hero = heroById.get(p.heroId);
            return (
              <button
                key={p.slot}
                type="button"
                aria-pressed={!hidden.has(p.slot)}
                onClick={() => {
                  const next = new Set(hidden);
                  if (!next.delete(p.slot)) next.add(p.slot);
                  setHidden(next);
                }}
              >
                <Picture
                  className="graph-legend-portrait"
                  src={hero?.cardImage ?? hero?.image}
                  label={heroName(p.heroId)}
                />
                <i style={{ background: colorOf(p) }} />
                {isMe(p, meId) ? "You" : heroName(p.heroId)}
              </button>
            );
          })}
          <button type="button" onClick={() => setHidden(new Set())}>
            Show all
          </button>
          {([0, 1] as Team[]).map((team) => (
            <button
              key={team}
              type="button"
              onClick={() =>
                setHidden(
                  new Set(
                    report.players
                      .filter((p) => p.team !== team)
                      .map((p) => p.slot),
                  ),
                )
              }
            >
              {TEAM_NAMES[team]} only
            </button>
          ))}
        </div>
      )}
      <p className="data-note graph-foot">
        {notes[mode]}. {FOOT}
      </p>
    </div>
  );
}
