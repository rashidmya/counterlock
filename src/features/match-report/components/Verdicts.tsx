import type { AsyncState } from "@/shared/api/useAsync";
import { RetryButton } from "@/shared/ui/RetryButton";
import { clock, percent } from "../utils/format";
import { verdicts } from "../utils/insights";
import { heroName } from "../utils/perspective";
import type { RankCurve, RankSource } from "../utils/rank-curve";
import type { ReportPlayer } from "../utils/report";

export function curveNote(
  hero: string,
  curve: AsyncState<RankCurve>,
  normal: boolean,
  durationS: number,
  rank: RankSource,
  // The player's current rank was needed but didn't load.
  rankFailed = false,
) {
  if (!normal) return "Rank averages cover normal matches only.";
  if (curve.loading) return "Loading the rank average…";
  if (!curve.data) return `Rank average unavailable: ${curve.error ?? ""}`;
  const { band, widenedFrom, points } = curve.data;
  const notes =
    (widenedFrom
      ? ` Too few ${hero} games at ${widenedFrom} alone, so this covers ${band.label}.`
      : "") +
    (rank === "current"
      ? " This player's rank isn't recorded for this match, so the average uses their current rank."
      : rank === "none"
        ? rankFailed
          ? " This player's rank isn't recorded for this match, and their current rank didn't load."
          : " This player's rank isn't recorded for this match, and there's no current rank to use."
        : "");
  if (!points.length)
    return `Too few ${hero} games at ${band.label} in the last 30 days.${notes}`;
  const end = points.at(-1)!.t;
  if (end < durationS)
    return `Too few ${hero} games at ${band.label} ran as long as this match (${clock(durationS)}), so there are no verdicts; the average stops at ${clock(end)}.${notes}`;
  return `Compared with the average ${hero} at ${band.label} at the same match length, over the last 30 days.${notes}`;
}

export function Verdicts({
  player,
  durationS,
  curve,
  normal,
  rank,
  rankFailed,
}: {
  player: ReportPlayer;
  durationS: number;
  curve: AsyncState<RankCurve>;
  rank: RankSource;
  rankFailed: boolean;
  normal: boolean;
}) {
  const hero = heroName(player.heroId);
  const band = curve.data?.band.label;
  return (
    <>
      <div className="report-verdicts">
        {verdicts(player, durationS, curve.data ?? null).map((v) => (
          <div className="verdict" key={v.label}>
            <small>{v.label}</small>
            <b>{v.value.toLocaleString("en-US")}</b>
            {curve.loading ? (
              <span className="muted">Loading…</span>
            ) : v.change === null ? (
              <span className="muted">No rank average</span>
            ) : percent(v.change) === "0%" ? (
              <span className="muted">
                Level with avg {hero} at {band}
              </span>
            ) : (
              <span className={v.change > 0 ? "good" : "bad"}>
                {v.change > 0 ? "▲" : "▼"} {percent(v.change)} vs avg {hero} at{" "}
                {band}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="data-note" role="status">
        {curveNote(hero, curve, normal, durationS, rank, rankFailed)}
        {/* The curve's Retry also asks again for the current rank. */}
        {(curve.error || (rankFailed && !curve.loading)) && (
          <>
            {" "}
            <RetryButton
              className="retry"
              focusTarget=".view-as select"
              onRetry={curve.retry}
            />
          </>
        )}
      </p>
    </>
  );
}
