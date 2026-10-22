import { RouteLink } from "@/app/links";
import { heroById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import { compact } from "../utils/format";
import { heroName, isMe, optionLabel } from "../utils/perspective";
import {
  TEAM_NAMES,
  finalValue,
  teamOf,
  type MatchReport,
  type Team,
} from "../utils/report";

export function Scoreboard({
  report,
  names,
  meId,
  selected,
  onSelect,
}: {
  report: MatchReport;
  names: Map<number, string>;
  meId: number | null;
  selected: number | null;
  onSelect(slot: number): void;
}) {
  const winner = report.winningTeam;
  const order: Team[] = [winner, winner === 0 ? 1 : 0];
  return order.map((team) => (
    <div className="report-team" key={team}>
      <h3 className={`report-team-name team-${team}`}>
        {TEAM_NAMES[team]}
        {team === winner && " · winner"}
      </h3>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>K / D / A</th>
              <th>Souls</th>
              <th>Hero dmg</th>
              <th>Dmg taken</th>
              <th>Obj. dmg</th>
              <th>Healing</th>
              <th>Last hits</th>
              <th aria-label="View as" />
            </tr>
          </thead>
          <tbody>
            {teamOf(report, team)
              .sort((a, b) => b.netWorth - a.netWorth || a.slot - b.slot)
              .map((p) => {
                const hero = heroById.get(p.heroId);
                const current = p.slot === selected;
                return (
                  <tr
                    key={p.slot}
                    className={current ? "selected" : undefined}
                    aria-current={current ? "true" : undefined}
                  >
                    <td>
                      <span className="report-player">
                        <Picture
                          className="report-portrait"
                          src={hero?.cardImage ?? hero?.image}
                          label={heroName(p.heroId)}
                        />
                        <span>
                          <b>{heroName(p.heroId)}</b>
                          {p.accountId > 0 && (
                            <RouteLink
                              className="report-player-link"
                              route={{
                                page: "profile",
                                accountId: p.accountId,
                              }}
                            >
                              {isMe(p, meId)
                                ? "You"
                                : names.get(p.accountId) || "Profile"}
                            </RouteLink>
                          )}
                        </span>
                      </span>
                    </td>
                    <td>
                      {p.kills} / {p.deaths} / {p.assists}
                    </td>
                    <td>{compact(p.netWorth)}</td>
                    <td>{compact(finalValue(p, "heroDamage"))}</td>
                    <td>{compact(finalValue(p, "damageTaken"))}</td>
                    <td>{compact(finalValue(p, "objectiveDamage"))}</td>
                    <td>{compact(finalValue(p, "healing"))}</td>
                    <td>{p.lastHits}</td>
                    <td>
                      <button
                        type="button"
                        className="view-as-link"
                        aria-label={`View as ${optionLabel(p, names, meId)}`}
                        disabled={current}
                        onClick={() => onSelect(p.slot)}
                      >
                        {current ? "Viewing" : "View as"}
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  ));
}
