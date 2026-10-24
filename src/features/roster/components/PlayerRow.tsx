import { catalog, heroById } from "@/shared/catalog";
import { winRate } from "@/features/player-stats/utils/winRate";
import { Picture } from "@/shared/ui/Picture";
import { ItemIcon } from "@/shared/ui/ItemIcon";
import type { Player, MatchState } from "@/features/match/types";

export function PlayerRow({
  player,
  state,
  enemy,
  selected,
  onSelect,
}: {
  player: Player;
  state: MatchState;
  enemy: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const hero = heroById.get(player.heroId);
  const stats = player.accountId ? state.stats[player.accountId] : undefined;
  const history = stats?.heroes?.find((h) => h.hero_id === player.heroId);
  const rank = stats?.rank;
  const unranked = rank?.rank === 0 || rank?.badge === 0;
  const rankMeta =
    rank && !unranked
      ? catalog.ranks.find((r) => r.tier === rank.rank)
      : undefined;
  const rate = history ? winRate(history.wins, history.matches_played) : null;
  const reason = !player.accountId
    ? "Steam ID unavailable"
    : state.loading && !stats
      ? "Loading statistics"
      : (stats?.heroError ??
        (history ? "Recorded matches on this hero" : "No recorded hero data"));
  return (
    <tr
      className={`${selected ? "selected" : ""} ${player.local ? "local" : ""}`}
    >
      <td>
        <button
          className="player-button"
          onClick={onSelect}
          disabled={!enemy}
          aria-pressed={enemy ? selected : undefined}
          aria-label={
            enemy ? `Counter ${hero?.name ?? player.heroName}` : undefined
          }
        >
          <Picture
            className="portrait"
            src={hero?.image}
            label={player.heroName}
          />
          <span className="player-label">
            <strong>
              {hero?.name ?? player.heroName}
              {player.local && <i>YOU</i>}
            </strong>
            <small>{player.name}</small>
            <span className="scout-roster-items" aria-label="Purchased items">
              {player.items.length ? (
                player.items.map((id, index) => {
                  const item = catalog.items.find((item) => item.id === id);
                  const name = item?.name ?? `Unknown item #${id}`;
                  return (
                    <span
                      className="scout-roster-item"
                      title={name}
                      aria-label={name}
                      data-item-id={id}
                      key={`${id}:${index}`}
                    >
                      {item ? <ItemIcon item={item} /> : <span>?</span>}
                    </span>
                  );
                })
              ) : (
                <span className="scout-items-empty">
                  {player.itemsKnown
                    ? "No purchased items"
                    : "Items unavailable"}
                </span>
              )}
            </span>
          </span>
        </button>
      </td>
      <td
        title={
          stats?.rankError ??
          (rank?.last_match
            ? `Rank from recorded match: ${new Date(rank.last_match.start_time * 1000).toLocaleDateString()}`
            : "Latest recorded rank, when available")
        }
      >
        <span className="rank">
          {!unranked && (
            <Picture
              className="rank-icon"
              src={rankMeta?.image}
              label={rankMeta?.name ?? "?"}
            />
          )}
          <span>
            {unranked
              ? "Unranked"
              : rankMeta
                ? `${rankMeta.name}${rank?.subrank ? ` ${rank.subrank}` : ""}`
                : "Unavailable"}
          </span>
        </span>
      </td>
      <td title={reason}>
        <span className={rate != null && rate >= 55 ? "positive" : "numeric"}>
          {rate == null ? "—" : `${rate.toFixed(1)}%`}
        </span>
        {rate != null && (
          <span className="rate-line">
            <span style={{ width: `${rate}%` }} />
          </span>
        )}
      </td>
      <td title={reason} className="numeric">
        {history?.matches_played.toLocaleString() ?? "—"}
      </td>
      <td className="kda">
        {player.kills ?? "—"}
        <span>/</span>
        {player.deaths ?? "—"}
        <span>/</span>
        {player.assists ?? "—"}
      </td>
    </tr>
  );
}
