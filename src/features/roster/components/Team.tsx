import type { Player, MatchState } from "@/features/match/types";
import { Icon } from "@/shared/ui/Icon";
import { PlayerRow } from "./PlayerRow";

export function Team({
  title,
  subtitle,
  players,
  state,
  enemy,
  selected,
  select,
}: {
  title: string;
  subtitle: string;
  players: Player[];
  state: MatchState;
  enemy: boolean;
  selected: string | null;
  select: (slot: string) => void;
}) {
  return (
    <section className={`team panel ${enemy ? "enemy" : "ally"}`}>
      <div className="panel-heading">
        <div>
          <span className="team-mark" />
          <h2>{title}</h2>
          <span className="count">{players.length}</span>
        </div>
        <span className="muted">{subtitle}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>HERO / PLAYER</th>
              <th>RANK</th>
              <th>HERO WIN %</th>
              <th>GAMES</th>
              <th>K / D / A</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <PlayerRow
                key={player.slot}
                {...{ player, state, enemy }}
                selected={selected === player.slot}
                onSelect={() => select(player.slot)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!players.length && (
        <div className="empty">
          <Icon name="eye" />
          <p>Waiting for the match roster</p>
          <small>
            Players appear when Overwolf reports their heroes and teams.
          </small>
        </div>
      )}
    </section>
  );
}
