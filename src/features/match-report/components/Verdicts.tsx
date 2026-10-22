import type { AsyncState } from "@/shared/api/useAsync";
import { clock, percent } from "../utils/format";
import { verdicts } from "../utils/insights";
import { heroName } from "../utils/perspective";
import type { RankCurve } from "../utils/rank-curve";
import type { ReportPlayer } from "../utils/report";

export function curveNote(
  hero: string,
  curve: AsyncState<RankCurve>,
  normal: boolean,
  durationS: number,
  fromLobby: boolean,
) {
  if (!normal) return "Rank averages cover normal matches only.";
  if (curve.loading) return "Loading the rank average…";
  if (!curve.data) return `Rank average unavailable: ${curve.error ?? ""}`;
  const { band, widenedFrom, points } = curve.data;
  const notes =
    (widenedFrom
      ? ` Too few ${hero} games at ${widenedFrom} alone, so this covers ${band.label}.`
      : "") +
    (fromLobby
      ? " This player's rank isn't recorded for this match, so the average uses the lobby's rank."
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
  fromLobby,
}: {
  player: ReportPlayer;
  durationS: number;
  curve: AsyncState<RankCurve>;
  fromLobby: boolean;
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
      <p className="data-note">
        {curveNote(hero, curve, normal, durationS, fromLobby)}
        {curve.error && (
          <>
            {" "}
            <button type="button" className="retry" onClick={curve.retry}>
              Retry
            </button>
          </>
        )}
      </p>
    </>
  );
}
