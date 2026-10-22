import { useId, useState } from "react";
import { clock } from "../utils/format";
import { formatValue, valueAt, type Point } from "../utils/graph";
import type { Metric } from "../utils/metrics";
import type { Team } from "../utils/report";

export interface ChartLine {
  key: string;
  label: string;
  color: string;
  focus: boolean;
  points: Point[];
}
export interface Markers {
  deaths: { t: number; title: string }[] | null;
  items: { t: number; image?: string; title: string }[] | null;
  objectives: { t: number; team: Team; boss: boolean; title: string }[] | null;
}

// Plot margins and the marker lanes below it, in pixels.
const LEFT = 80;
const RIGHT = 24;
const TOP = 12;
const BOTTOM = 24;
export const LANES = 66;

/** About 24% of the width, kept between 190 and 260px. */
export const plotHeight = (width: number) =>
  Math.round(Math.min(260, Math.max(190, width * 0.24)));

/** Points inside [t0, t1] plus one either side, so lines run to the edges (the plot clips them). */
function visible<T extends [number, ...number[]]>(
  points: T[],
  t0: number,
  t1: number,
): T[] {
  const first = Math.max(0, points.findIndex(([t]) => t >= t0) - 1);
  const after = points.findIndex(([t]) => t > t1);
  return points.slice(first, after === -1 ? undefined : after + 1);
}

// Tooltip rows only where a series has data: no values held before its
// first snapshot or after the rank average stops.
const covers = (points: [number, ...number[]][], t: number) =>
  points.length > 0 && t >= points[0][0] && t <= points.at(-1)![0];

export function GraphChart({
  width,
  lines,
  average,
  averageLabel,
  metric,
  markers,
  t0,
  t1,
  lead,
  perMinute,
}: {
  width: number;
  lines: ChartLine[];
  average: [number, number, number][] | null;
  averageLabel: string;
  metric: Metric;
  markers: Markers;
  t0: number;
  t1: number;
  lead: boolean;
  perMinute: boolean;
}) {
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);
  const height = plotHeight(width);
  const x = (t: number) =>
    LEFT + ((t - t0) / Math.max(1, t1 - t0)) * (width - LEFT - RIGHT);
  const shown = lines.map((line) => ({
    ...line,
    points: visible(line.points, t0, t1),
  }));
  const band = average ? visible(average, t0, t1) : [];
  const inside = (t: number) => t >= t0 && t <= t1;
  const values = [
    ...shown.flatMap((line) =>
      line.points.filter(([t]) => inside(t)).map(([, v]) => v),
    ),
    ...band.filter(([t]) => inside(t)).map(([, v, s]) => v + s),
  ];
  let low = Math.min(0, ...values);
  let high = Math.max(...values, 0) * 1.06 || 1;
  if (lead) {
    const most = Math.max(...values.map(Math.abs), 1) * 1.1;
    low = -most;
    high = most;
  }
  const y = (v: number) =>
    TOP + (1 - (v - low) / (high - low)) * (height - TOP - BOTTOM);
  const path = (points: [number, number][]) =>
    points.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = Array.from(
    { length: 6 },
    (_, i) => low + ((high - low) * i) / 5,
  );
  const step = width < 520 ? 600 : 300;
  const minutes: number[] = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) minutes.push(t);
  const lanes = {
    deaths: height + 12,
    items: height + 32,
    objectives: height + 52,
  };

  const hoverRows =
    hover === null
      ? []
      : [
          ...shown
            .filter((line) => covers(line.points, hover))
            .map((line) => ({
              key: line.key,
              label: line.label,
              color: line.color,
              value: valueAt(line.points, hover),
            }))
            .sort((a, b) => b.value - a.value),
          ...(covers(band, hover)
            ? [
                {
                  key: "avg",
                  label: averageLabel,
                  color: "var(--cream)",
                  value: valueAt(
                    band.map(([t, v]) => [t, v] as [number, number]),
                    hover,
                  ),
                },
              ]
            : []),
        ];
  const hoverX = hover === null ? 0 : x(hover);

  return (
    <>
      <svg
        className="graph-svg"
        width={width}
        height={height + LANES}
        viewBox={`0 0 ${width} ${height + LANES}`}
        role="img"
        aria-label={`${metric.label}${perMinute ? " per minute" : ""}, ${clock(t0)} to ${clock(t1)}`}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={LEFT} y={0} width={width - LEFT - RIGHT} height={height} />
          </clipPath>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line
              className="graph-grid"
              x1={LEFT}
              x2={width - RIGHT}
              y1={y(v)}
              y2={y(v)}
            />
            <text
              className="graph-axis"
              x={LEFT - 8}
              y={y(v) + 4}
              textAnchor="end"
            >
              {formatValue(v, metric)}
            </text>
          </g>
        ))}
        {minutes.map((t) => (
          <g key={t}>
            <line
              className="graph-grid"
              x1={x(t)}
              x2={x(t)}
              y1={TOP}
              y2={height - BOTTOM}
            />
            <text
              className="graph-axis"
              x={x(t)}
              y={height - BOTTOM + 16}
              textAnchor="middle"
            >
              {t / 60} min
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clip})`}>
          {lead && (
            <>
              <line
                className="graph-zero"
                x1={LEFT}
                x2={width - RIGHT}
                y1={y(0)}
                y2={y(0)}
              />
              <text
                className="graph-lead-label team-0"
                x={LEFT + 6}
                y={TOP + 12}
              >
                AMBER AHEAD
              </text>
              <text
                className="graph-lead-label team-1"
                x={LEFT + 6}
                y={height - BOTTOM - 6}
              >
                SAPPHIRE AHEAD
              </text>
            </>
          )}
          {band.length > 0 && (
            <>
              <polygon
                className="graph-band"
                points={`${path(band.map(([t, v, s]) => [t, v + s]))} ${path(
                  [...band]
                    .reverse()
                    .map(([t, v, s]) => [t, Math.max(low, v - s)]),
                )}`}
              />
              <polyline
                className="graph-avg"
                points={path(band.map(([t, v]) => [t, v]))}
              />
            </>
          )}
          {[...shown]
            .sort((a, b) => Number(a.focus) - Number(b.focus))
            .map((line) => (
              <polyline
                key={line.key}
                className={`graph-line${line.focus ? " focus" : ""}`}
                style={{ stroke: line.color }}
                points={path(line.points)}
              />
            ))}
        </g>
        {markers.deaths && (
          <g className="graph-lane">
            <text
              className="graph-lane-label"
              x={LEFT - 8}
              y={lanes.deaths + 4}
              textAnchor="end"
            >
              DEATHS
            </text>
            {markers.deaths
              .filter((m) => inside(m.t))
              .map((m) => (
                <circle
                  key={m.t}
                  className="mark-death"
                  cx={x(m.t)}
                  cy={lanes.deaths}
                  r={5}
                >
                  <title>{m.title}</title>
                </circle>
              ))}
          </g>
        )}
        {markers.items && (
          <g className="graph-lane">
            <text
              className="graph-lane-label"
              x={LEFT - 8}
              y={lanes.items + 4}
              textAnchor="end"
            >
              ITEMS
            </text>
            {markers.items
              .filter((m) => inside(m.t))
              .map((m, index) =>
                m.image ? (
                  <image
                    key={index}
                    className="mark-item"
                    href={m.image}
                    x={x(m.t) - 8}
                    y={lanes.items - 8}
                    width={16}
                    height={16}
                  >
                    <title>{m.title}</title>
                  </image>
                ) : (
                  <rect
                    key={index}
                    className="mark-item"
                    x={x(m.t) - 5}
                    y={lanes.items - 5}
                    width={10}
                    height={10}
                  >
                    <title>{m.title}</title>
                  </rect>
                ),
              )}
          </g>
        )}
        {markers.objectives && (
          <g className="graph-lane">
            <text
              className="graph-lane-label"
              x={LEFT - 8}
              y={lanes.objectives + 4}
              textAnchor="end"
            >
              OBJECTIVES
            </text>
            {markers.objectives
              .filter((m) => inside(m.t))
              .map((m, index) => {
                const cx = x(m.t);
                const cy = lanes.objectives;
                return m.boss ? (
                  <polygon
                    key={index}
                    className={`mark-boss team-${m.team}`}
                    points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
                  >
                    <title>{m.title}</title>
                  </polygon>
                ) : (
                  <rect
                    key={index}
                    className={`mark-objective team-${m.team}`}
                    x={cx - 3}
                    y={cy - 6}
                    width={6}
                    height={12}
                  >
                    <title>{m.title}</title>
                  </rect>
                );
              })}
          </g>
        )}
        {hover !== null && (
          <line
            className="graph-cross"
            x1={hoverX}
            x2={hoverX}
            y1={TOP}
            y2={height - BOTTOM}
          />
        )}
        <rect
          className="graph-hit"
          x={LEFT}
          y={TOP}
          width={width - LEFT - RIGHT}
          height={height - TOP - BOTTOM}
          onPointerMove={(event) => {
            const box =
              event.currentTarget.ownerSVGElement!.getBoundingClientRect();
            const px = ((event.clientX - box.left) / box.width) * width;
            const t = t0 + ((px - LEFT) / (width - LEFT - RIGHT)) * (t1 - t0);
            setHover(Math.min(t1, Math.max(t0, t)));
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && hoverRows.length > 0 && (
        <div
          className="graph-tip"
          role="status"
          style={{
            left: hoverX > width * 0.6 ? hoverX - 234 : hoverX + 14,
          }}
        >
          <b>
            {clock(hover)} · {metric.label}
            {perMinute ? " / min" : ""}
          </b>
          {hoverRows.slice(0, 13).map((row) => (
            <div key={row.key}>
              <span>
                <i style={{ background: row.color }} />
                {row.label}
              </span>
              <span>{formatValue(row.value, metric)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
