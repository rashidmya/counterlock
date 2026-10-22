import { useRef } from "react";
import { useElementWidth } from "@/shared/ui/useElementWidth";
import type { GamePoint } from "../utils/performance-metrics";

const HEIGHT = 80;
const PAD_X = 6;
const PAD_Y = 8;

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
  // Breaks the line at games without a value.
  const path = (pick: (p: GamePoint) => number | null) =>
    points
      .map((p, index) => {
        const value = pick(p);
        if (value === null) return "";
        const previous = index > 0 ? pick(points[index - 1]) : null;
        return `${previous === null ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
      })
      .join("");
  return (
    <div className="sparkline" ref={box}>
      {width > 0 && values.length > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={label}>
          <path className="spark-average" d={path((p) => p.average)} />
          <path className="spark-value" d={path((p) => p.value)} />
          {points.map((p, index) =>
            p.value === null ? null : (
              <circle
                key={p.matchId}
                className={p.won ? "win" : "loss"}
                cx={x(index)}
                cy={y(p.value)}
                r={3}
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
