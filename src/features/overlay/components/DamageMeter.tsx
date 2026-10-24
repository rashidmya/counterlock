import type { MatchState } from "@/features/match/types";
import type { Catalog } from "@/shared/catalog/types";
import { Picture } from "@/shared/ui/Picture";
import { meterRows, type MeterMetric } from "../utils/meters";

export function DamageMeter({
  state,
  catalog,
  metric,
}: {
  state: MatchState;
  catalog: Catalog;
  metric: MeterMetric;
}) {
  return (
    <ol className="hud-meter" aria-label="Players ranked by total">
      {meterRows(state.players, metric).map(
        ({ player, value, fraction, tone }) => {
          const hero = catalog.heroes.find((h) => h.id === player.heroId);
          return (
            <li
              className="hud-meter-row"
              key={player.slot}
              data-slot={player.slot}
              data-tone={tone}
            >
              <span
                className="hud-meter-fill"
                style={{ width: `${fraction * 100}%` }}
                aria-hidden="true"
              />
              <Picture
                src={hero?.image}
                label={hero?.name ?? player.heroName}
                className="hud-portrait"
              />
              <span
                className="hud-player"
                title={`${hero?.name ?? player.heroName} · ${player.name}`}
              >
                <strong>
                  {hero?.name ?? player.heroName}
                  {player.local && <b className="hud-you">You</b>}
                </strong>
                <small>{player.name}</small>
              </span>
              <strong className="hud-meter-value">
                {value === null ? "—" : value.toLocaleString()}
              </strong>
            </li>
          );
        },
      )}
    </ol>
  );
}
