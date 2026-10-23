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
 * details first; dragging along the chart moves the pick.
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
  // The picked game's match id: when new games replace these, an index
  // would point at another game.
  const [picked, setPicked] = useState<number | null>(null);
  const pointer = useRef("mouse");
  const index = points.findIndex((p) => p.matchId === picked);
  const game = index < 0 ? undefined : points[index];
  const picking = !!game;
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
  const text = describe(game ?? points[last]);
  const pick = (at: number) => setPicked(points[at].matchId);
  const at = (event: MouseEvent<SVGRectElement>) =>
    nearestGame(
      event.clientX -
        event.currentTarget.ownerSVGElement!.getBoundingClientRect().left,
      width,
      points.length,
    );
  const track = (event: PointerEvent<SVGRectElement>) => {
    pointer.current = event.pointerType;
    pick(at(event));
  };
  const keys = (event: KeyboardEvent) => {
    // Browser shortcuts such as Alt+Left stay the browser's.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const back = Math.max(0, (index < 0 ? last + 1 : index) - 1);
    const next = Math.min(last, (index < 0 ? last : index) + 1);
    const moves: Record<string, number> = {
      ArrowLeft: back,
      ArrowDown: back,
      ArrowRight: next,
      ArrowUp: next,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      pick(moves[event.key]);
    } else if (event.key === "Enter" && game) navigate(route(game));
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
      // Escape clears the pick, from the chart or the tip's link.
      onKeyDown={(event) => {
        if (event.key === "Escape") setPicked(null);
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
        aria-valuenow={(index < 0 ? last : index) + 1}
        aria-valuetext={`${text.game}: ${text.value}${text.average ? `, ${text.average}` : ""}`}
        onKeyDown={keys}
        // The keyboard starts on the newest game.
        onFocus={() =>
          setPicked((current) =>
            points.some((p) => p.matchId === current)
              ? current
              : points[last].matchId,
          )
        }
      >
        {width > 0 && values.length > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden="true">
            {game && (
              <line
                className="spark-cross"
                x1={x(index)}
                x2={x(index)}
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
            {points.map((p, at) =>
              p.value === null ? null : (
                <circle
                  key={p.matchId}
                  className={`${p.won ? "win" : "loss"}${at === index ? " picked" : ""}`}
                  cx={x(at)}
                  cy={y(p.value)}
                  r={at === index ? radius + 1.5 : radius}
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
                // A tap only picks; a modified click is the browser's.
                if (
                  pointer.current === "touch" ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                navigate(route(points[at(event)]));
              }}
            />
          </svg>
        )}
      </div>
      {game && (
        // On the picked game's side, over the card's numbers, so the whole
        // line stays in sight.
        <div
          className={`spark-tip${x(index) > width / 2 ? " right" : ""}`}
          // A press here keeps focus where it is: Safari doesn't focus a
          // link on press, so the chart's blur would clear the tip first.
          onMouseDown={(event) => event.preventDefault()}
        >
          <span>{text.game}</span>
          <span>
            <b>{text.value}</b>
            {text.average ? ` ${text.average}` : ""} ·{" "}
            <RouteLink route={route(game)} aria-label="Match report">
              Report →
            </RouteLink>
          </span>
        </div>
      )}
    </div>
  );
}
