import type { Navigate } from "@/app/navigation";
import { heroById, itemById } from "@/shared/catalog";
import { gameIcons } from "@/shared/ui/gameIcons";
import { ItemIcon } from "@/shared/ui/ItemIcon";
import { Picture } from "@/shared/ui/Picture";
import { useAsync } from "@/shared/api/useAsync";
import {
  fetchScoreboard,
  type ScoreboardPlayer,
} from "../services/profile-api";
import { compactSouls, duration } from "../utils/format";

function TeamTable({
  title,
  won,
  players,
  accountId,
  navigate,
}: {
  title: string;
  won: boolean;
  players: ScoreboardPlayer[];
  accountId: number;
  navigate: Navigate;
}) {
  return (
    <div className={`scoreboard-team ${won ? "winner" : ""}`}>
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>HERO</th>
            <th>K / D / A</th>
            <th>SOULS</th>
            <th>ITEMS</th>
          </tr>
        </thead>
        <tbody>
          {[...players]
            .sort((a, b) => b.netWorth - a.netWorth)
            .map((player, index) => {
              const hero = heroById.get(player.heroId);
              const name = hero?.name ?? `Hero ${player.heroId}`;
              const local = player.accountId === accountId;
              return (
                <tr
                  key={`${player.accountId}-${index}`}
                  className={`score-row ${local ? "local" : ""}`}
                >
                  <td>
                    <button
                      className="hero-link"
                      onClick={() =>
                        navigate({ page: "heroes", heroId: player.heroId })
                      }
                    >
                      <Picture
                        className="hero-portrait"
                        src={hero?.image}
                        label={name}
                      />
                      {name}
                    </button>
                    {local && <b className="you">YOU</b>}
                  </td>
                  <td>
                    {player.kills} / {player.deaths} / {player.assists}
                  </td>
                  <td>
                    <span className="with-icon">
                      <img src={gameIcons.souls} alt="" />
                      {compactSouls(player.netWorth)}
                    </span>
                  </td>
                  <td>
                    <span className="score-items">
                      {player.items.map((id) => {
                        const item = itemById.get(id);
                        return item && <ItemIcon key={id} item={item} />;
                      })}
                    </span>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export function MatchDetail({
  matchId,
  accountId,
  navigate,
}: {
  matchId: number;
  accountId: number;
  navigate: Navigate;
}) {
  const { data, loading } = useAsync(() => fetchScoreboard(matchId), [matchId]);
  if (loading) return <p className="match-detail muted">Loading match…</p>;
  if (!data)
    return <p className="match-detail muted">Match details unavailable</p>;
  const team = (winners: boolean) =>
    data.players.filter((p) => (p.team === data.winningTeam) === winners);
  return (
    <div className="match-detail">
      <div className="scoreboard">
        <TeamTable
          title="WINNERS"
          won
          players={team(true)}
          {...{ accountId, navigate }}
        />
        <TeamTable
          title="LOSERS"
          won={false}
          players={team(false)}
          {...{ accountId, navigate }}
        />
      </div>
      <p className="data-note">
        Match length {duration(data.durationS)}. Items are final inventories.
      </p>
    </div>
  );
}
