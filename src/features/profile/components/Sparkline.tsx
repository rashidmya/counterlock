import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { RouteLink, useLinks } from "@/app/links";
import type { Route } from "@/app/navigation";
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

// What a picked game shows: "Ivy · Win · 5d ago", "1,226", "rank avg 1,107".
export interface PointText {
  game: string;
  value: string;
  average?: string;
}

/**
 * A dot's radius for games `step` px apart. Dots shrink as games crowd
 * together, but not below 2 px, so a win or loss still shows on Last 100; an
 * outline in the card's colour keeps neighbours apart and off the line.
 */
export const dotRadius = (step: number) => Math.min(3, Math.max(2, step * 0.4));

/** The game nearest to `px` on a chart `width` wide showing `count` games. */
export function nearestGame(px: number, width: number, count: number) {
  if (count <= 1) return 0;
  const step = (width - 2 * PAD_X) / (count - 1);
  return Math.min(count - 1, Math.max(0, Math.round((px - PAD_X) / step)));
}

/**
 * One point per game, oldest on the left: the player's line with a win or
 * loss dot per game, and the dashed rank average. Drawn at its real width.
 *
 * Pointing at it, or the arrow keys, picks the nearest game and describes
 * it above the chart. A click, Enter or the tip's "Report" link opens that
 * game's match report. A tap only picks, so a touch screen shows the
 * details first.
 */
export function Sparkline({
  points,
  label,
  describe,
  route,
}: {
  points: GamePoint[];
  label: string;
  describe(point: GamePoint): PointText;
  route(point: GamePoint): Route;
}) {
  const chart = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const width = useElementWidth(chart);
  const { navigate } = useLinks();
  const [picked, setPicked] = useState<number | null>(null);
  const pointer = useRef("mouse");
  const picking = picked !== null;
  // A tapped game stays picked; tapping anywhere outside clears it.
  useEffect(() => {
    if (!picking) return;
    const clear = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setPicked(null);
    };
    document.addEventListener("pointerdown", clear);
    return () => document.removeEventListener("pointerdown", clear);
  }, [picking]);
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
  const step =
    points.length > 1 ? (width - 2 * PAD_X) / (points.length - 1) : width;
  const radius = dotRadius(step);
  const last = points.length - 1;
  const game = picked === null ? undefined : points[picked];
  const text = describe(game ?? points[last]);
  const at = (event: MouseEvent<SVGRectElement>) =>
    nearestGame(
      event.clientX -
        event.currentTarget.ownerSVGElement!.getBoundingClientRect().left,
      width,
      points.length,
    );
  const track = (event: PointerEvent<SVGRectElement>) => {
    pointer.current = event.pointerType;
    setPicked(at(event));
  };
  const keys = (event: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: Math.max(0, (picked ?? last + 1) - 1),
      ArrowRight: Math.min(last, (picked ?? last) + 1),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setPicked(moves[event.key]);
    } else if (event.key === "Enter" && game) navigate(route(game));
    else if (event.key === "Escape") setPicked(null);
  };
  return (
    <div
      className="sparkline-box"
      ref={box}
      // A mouse leaving clears the pick; a tap keeps it.
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setPicked(null);
      }}
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget as Node))
          setPicked(null);
      }}
    >
      <div
        className="sparkline"
        ref={chart}
        role="slider"
        tabIndex={0}
        aria-label={`${label}. Arrow keys pick a game, Enter opens its match report.`}
        aria-valuemin={1}
        aria-valuemax={points.length}
        aria-valuenow={(picked ?? last) + 1}
        aria-valuetext={`${text.game}: ${text.value}${text.average ? `, ${text.average}` : ""}`}
        onKeyDown={keys}
        // The keyboard starts on the newest game.
        onFocus={() => setPicked((current) => current ?? last)}
      >
        {width > 0 && values.length > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden="true">
            {game && (
              <line
                className="spark-cross"
                x1={x(picked!)}
                x2={x(picked!)}
                y1={0}
                y2={HEIGHT}
              />
            )}
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
                  className={`${p.won ? "win" : "loss"}${index === picked ? " picked" : ""}`}
                  cx={x(index)}
                  cy={y(p.value)}
                  r={index === picked ? radius + 1.5 : radius}
                />
              ),
            )}
            <rect
              className="spark-hit"
              width={width}
              height={HEIGHT}
              onPointerMove={track}
              onPointerDown={track}
              onClick={(event) => {
                if (pointer.current !== "touch")
                  navigate(route(points[at(event)]));
              }}
            />
          </svg>
        )}
      </div>
      {game && (
        // On the picked game's side, over the card's numbers, so the whole
        // line stays in sight.
        <div className={`spark-tip${x(picked!) > width / 2 ? " right" : ""}`}>
          <span>{text.game}</span>
          <span>
            <b>{text.value}</b> {text.average && <>{text.average} · </>}
            <RouteLink route={route(game)}>Report →</RouteLink>
          </span>
        </div>
      )}
    </div>
  );
}
