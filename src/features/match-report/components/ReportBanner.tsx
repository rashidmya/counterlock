import { timeAgo } from "@/features/profile/utils/format";
import { catalog, heroById } from "@/shared/catalog";
import { OptionalImage } from "@/shared/ui/OptionalImage";
import { Picture } from "@/shared/ui/Picture";
import { clock, compact } from "../utils/format";
import { displayName, heroName } from "../utils/perspective";
import { lobbyBadge } from "../utils/rank-curve";
import {
  NORMAL_MODE,
  TEAM_NAMES,
  teamOf,
  type MatchReport,
  type ReportPlayer,
} from "../utils/report";

function eyebrow(report: MatchReport) {
  const tier = Math.floor(lobbyBadge(report.players) / 10);
  const rank = catalog.ranks.find((r) => r.tier === tier && tier > 0)?.name;
  const lobby =
    report.gameMode !== NORMAL_MODE
      ? "Street Brawl"
      : rank
        ? `${rank}-level lobby`
        : undefined;
  return [
    `Match ${report.matchId}`,
    ...(lobby ? [lobby] : []),
    ...(report.startTime ? [timeAgo(report.startTime * 1000)] : []),
  ].join(" · ");
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ReportBanner({
  report,
  selected,
  names,
  meId,
}: {
  report: MatchReport;
  selected?: ReportPlayer;
  names: Map<number, string>;
  meId: number | null;
}) {
  if (!selected) {
    const souls = (team: 0 | 1) =>
      teamOf(report, team).reduce((sum, p) => sum + p.netWorth, 0);
    const kills = (team: 0 | 1) =>
      teamOf(report, team).reduce((sum, p) => sum + p.kills, 0);
    return (
      <div className="report-banner whole">
        <div className="report-banner-body">
          <p className="eyebrow">{eyebrow(report)} · whole match</p>
          <h1 className="report-result">
            {TEAM_NAMES[report.winningTeam]} won
          </h1>
          <dl className="report-stats">
            <Stat label="Duration" value={clock(report.durationS)} />
            <Stat label="Amber souls" value={compact(souls(0))} />
            <Stat label="Sapphire souls" value={compact(souls(1))} />
            <Stat label="Kills" value={`${kills(0)} – ${kills(1)}`} />
          </dl>
        </div>
      </div>
    );
  }
  const hero = heroById.get(selected.heroId);
  const won = selected.team === report.winningTeam;
  const minutes = report.durationS / 60;
  return (
    <div className={`report-banner ${won ? "won" : "lost"}`}>
      <div className="hero-art" key={selected.heroId}>
        <OptionalImage src={hero?.backgroundImage} className="hero-art-bg" />
      </div>
      <Picture
        key={selected.heroId}
        className="report-banner-portrait"
        src={hero?.cardImage ?? hero?.image}
        label={heroName(selected.heroId)}
      />
      <div className="report-banner-body">
        <p className="eyebrow">{eyebrow(report)}</p>
        <h1 className="report-result">{won ? "Victory" : "Defeat"}</h1>
        <dl className="report-stats">
          <Stat label="Player" value={displayName(selected, names, meId)} />
          <Stat label="Hero" value={heroName(selected.heroId)} />
          <Stat
            label="K / D / A"
            value={`${selected.kills} / ${selected.deaths} / ${selected.assists}`}
          />
          <Stat label="Souls" value={compact(selected.netWorth)} />
          <Stat
            label="Souls / min"
            value={
              minutes > 0
                ? Math.round(selected.netWorth / minutes).toLocaleString(
                    "en-US",
                  )
                : "—"
            }
          />
          <Stat label="Last hits" value={String(selected.lastHits)} />
          <Stat label="Duration" value={clock(report.durationS)} />
        </dl>
      </div>
    </div>
  );
}
