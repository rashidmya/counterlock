import { useRef } from "react";
import { useElementWidth } from "@/shared/ui/useElementWidth";
import type { GamePoint } from "../utils/performance-metrics";

const HEIGHT = 80;
const PAD_X = 6;
const PAD_Y = 8;

/**
 * A path through the values, broken at games without one. A value with no
 * neighbour on either side gets a 4 px tick centred on it (one dash of the
 * dashed average), so it still shows.
 */
export function linePath(
  values: (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
) {
  return values
    .map((value, index) => {
      if (value === null) return "";
      const before = values[index - 1] ?? null;
      const after = values[index + 1] ?? null;
      if (before === null && after === null)
        return `M${(x(index) - 2).toFixed(1)},${y(value).toFixed(1)}h4`;
      return `${before === null ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
    })
    .join("");
}

/**
 * One point per game, oldest on the left: the player's line with a win or
 * loss dot per game, and the dashed rank average. Drawn at its real width.
 */
export function Sparkline({
  points,
  label,
  title,
}: {
  points: GamePoint[];
  label: string;
  title(point: GamePoint): string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(box);
  const values = points.flatMap((p) =>
    [p.value, p.average].filter((v): v is number => v !== null),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (index: number) =>
    points.length === 1
      ? width / 2
      : PAD_X + (index * (width - 2 * PAD_X)) / (points.length - 1);
  const y = (value: number) =>
    max === min
      ? HEIGHT / 2
      : PAD_Y + ((max - value) * (HEIGHT - 2 * PAD_Y)) / (max - min);
  // Dots shrink as games crowd together, so the line stays visible.
  const step =
    points.length > 1 ? (width - 2 * PAD_X) / (points.length - 1) : width;
  const radius = Math.min(3, Math.max(1.25, step * 0.4));
  return (
    <div className="sparkline" ref={box}>
      {width > 0 && values.length > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={label}>
          <path
            className="spark-average"
            d={linePath(
              points.map((p) => p.average),
              x,
              y,
            )}
          />
          <path
            className="spark-value"
            d={linePath(
              points.map((p) => p.value),
              x,
              y,
            )}
          />
          {points.map((p, index) =>
            p.value === null ? null : (
              <circle
                key={p.matchId}
                className={p.won ? "win" : "loss"}
                cx={x(index)}
                cy={y(p.value)}
                r={radius}
              >
                <title>{title(p)}</title>
              </circle>
            ),
          )}
        </svg>
      )}
    </div>
  );
}
