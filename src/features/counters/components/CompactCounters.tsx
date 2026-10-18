import { useState } from "react";
import type { Catalog } from "@/shared/catalog/types";
import type { MatchState } from "@/features/match/types";
import { OverlayItem } from "@/shared/ui/OverlayItem";
import { splitTeams } from "@/features/match/utils/game";
import { recommend } from "../utils/recommendations";

export function CompactCounters({
  catalog,
  state,
}: {
  catalog: Catalog;
  state: MatchState;
}) {
  const [selected, setSelected] = useState("all");
  const { enemies } = splitTeams(state.players);
  const enemy = enemies.find((p) => p.slot === selected);
  const owned = state.players.find((p) => p.local)?.items ?? [];
  const items = recommend(
    enemy ? [enemy] : enemies,
    catalog.items,
    6400,
    owned,
    [],
  ).slice(0, 6);
  return (
    <section className="hud-counters">
      <select
        aria-label="Counter target"
        value={enemy?.slot ?? "all"}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="all">Entire enemy team</option>
        {enemies.map((p) => (
          <option key={p.slot} value={p.slot}>
            {catalog.heroes.find((h) => h.id === p.heroId)?.name ?? p.heroName}
          </option>
        ))}
      </select>
      <div className="hud-items">
        {items.map((entry) => (
          <OverlayItem
            key={entry.item.id}
            item={entry.item}
            detail={entry.reasons.join(" ")}
            targets={entry.targets}
          />
        ))}
      </div>
      {!items.length && (
        <p className="hud-empty">
          {enemies.length
            ? "No counter suggestions yet."
            : "Waiting for enemy heroes."}
        </p>
      )}
      <small className="hud-note">
        Counter suggestions · hover for details
      </small>
    </section>
  );
}
