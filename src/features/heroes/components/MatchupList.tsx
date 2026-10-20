import { RouteLink } from "@/app/links";
import { heroById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import type { Matchup } from "../utils/analytics";

export function MatchupList({ rows }: { rows: Matchup[] }) {
  return (
    <div className="matchups">
      {rows.map((row) => {
        const hero = heroById.get(row.heroId);
        const name = hero?.name ?? `Hero ${row.heroId}`;
        const body = (
          <>
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
          </>
        );
        return hero ? (
          <RouteLink
            key={row.heroId}
            className="matchup"
            route={{ page: "heroes", heroId: row.heroId }}
          >
            {body}
          </RouteLink>
        ) : (
          <button key={row.heroId} className="matchup" disabled>
            {body}
          </button>
        );
      })}
    </div>
  );
}
