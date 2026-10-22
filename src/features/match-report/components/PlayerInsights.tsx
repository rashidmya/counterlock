import { SectionHeader } from "@/shared/ui/SectionHeader";
import { compact, percent } from "../utils/format";
import { buffs, impact } from "../utils/insights";
import { displayName, heroName, isMe, possessive } from "../utils/perspective";
import type { RankCurve } from "../utils/rank-curve";
import type { MatchReport, ReportPlayer } from "../utils/report";
import { stretches } from "../utils/stretches";

// Impact bars fill at half the team's total; an even share is 1/6.
const BAR_FULL_SHARE = 0.5;
const EVEN_SHARE = 1 / 6;

export function PlayerInsights({
  player,
  report,
  curve,
  curveLoading,
  curveFailed,
  names,
  meId,
}: {
  player: ReportPlayer;
  report: MatchReport;
  curve: RankCurve | null;
  curveLoading: boolean;
  curveFailed: boolean;
  names: Map<number, string>;
  meId: number | null;
}) {
  const name = displayName(player, names, meId);
  const hero = heroName(player.heroId);
  const { rows, killParticipation } = impact(player, report.players);
  const pickups = buffs(player, report.durationS, curve);
  const bar = (share: number) =>
    `${Math.min(share / BAR_FULL_SHARE, 1) * 100}%`;
  return (
    <div className="report-cols">
      <div>
        <SectionHeader title="Best & worst stretches" />
        <p className="data-note">
          {curve
            ? `Souls against the average ${hero} at ${curve.band.label} at each snapshot · normal range = ±1 standard deviation`
            : curveLoading
              ? "Loading the rank average…"
              : curveFailed
                ? "Rank average unavailable, so only deaths are listed."
                : "No rank average for this match, so only deaths are listed."}
        </p>
        <ul className="stretches">
          {stretches(player, curve).map((s) => (
            <li key={s.label} className="stretch">
              <b className={s.tone}>{s.label}</b>
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <SectionHeader title="Impact" />
        <p className="data-note">
          {possessive(name, isMe(player, meId))} share of the team's total ·
          bars fill at half · the line marks an even 1/6 share
        </p>
        <div className="impact">
          {rows.map((row) => (
            <div className="impact-row" key={row.label}>
              <span>{row.label}</span>
              <span className="impact-track" aria-hidden="true">
                <i style={{ width: bar(row.share) }} />
                <u style={{ left: bar(EVEN_SHARE) }} />
              </span>
              <b>
                {percent(row.share)} <small>{compact(row.value)}</small>
              </b>
            </div>
          ))}
          <p className="impact-kp">
            <span>Kill participation</span>
            <b>{percent(killParticipation.share)}</b>
            <small>
              {killParticipation.involved} of {killParticipation.teamKills} team
              kills
            </small>
          </p>
        </div>
        <SectionHeader title="Permanent buffs" />
        <dl className="report-stats buffs">
          <div>
            <dt>Picked up</dt>
            <dd
              className={
                pickups.average === null
                  ? undefined
                  : pickups.count >= pickups.average
                    ? "good"
                    : "bad"
              }
            >
              {pickups.count}
            </dd>
          </div>
          <div>
            <dt>
              {curve ? `Avg ${hero} at ${curve.band.label}` : "Rank average"}
            </dt>
            <dd>
              {curveLoading
                ? "…"
                : pickups.average === null
                  ? "—"
                  : pickups.average.toFixed(1)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
