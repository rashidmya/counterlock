import { heroById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import type { Matchup } from "../utils/analytics";

export function MatchupList({
  rows,
  onOpen,
}: {
  rows: Matchup[];
  onOpen(heroId: number): void;
}) {
  return (
    <div className="matchups">
      {rows.map((row) => {
        const hero = heroById.get(row.heroId);
        const name = hero?.name ?? `Hero ${row.heroId}`;
        return (
          <button
            key={row.heroId}
            className="matchup"
            disabled={!hero}
            onClick={() => onOpen(row.heroId)}
          >
            <Picture
              className="hero-portrait matchup-portrait"
              src={hero?.image}
              label={name}
            />
            <span className="matchup-name">{name}</span>
            <small>{row.matches.toLocaleString()} games</small>
            <b className={row.winRate >= 0.5 ? "win" : "loss"}>
              {(row.winRate * 100).toFixed(1)}%
            </b>
          </button>
        );
      })}
    </div>
  );
}
