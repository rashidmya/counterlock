import { useEffect, useState } from "react";
import type { Catalog } from "@/shared/catalog/types";
import type { MatchState } from "@/features/match/types";
import { OverlayItem } from "@/shared/ui/OverlayItem";
import { useMeasuredBuild } from "../hooks/useMeasuredBuild";

export function CompactBuild({
  catalog,
  state,
}: {
  catalog: Catalog;
  state: MatchState;
}) {
  const local = state.players.find((p) => p.local);
  const id = local?.heroId;
  const result = useMeasuredBuild(id, state.gameMode, "compact");
  const [group, setGroup] = useState(0);
  useEffect(() => {
    setGroup(0);
  }, [id, state.gameMode]);
  const data = result?.data;
  const selected = data?.groups[group];
  return (
    <section className="hud-build">
      <div className="hud-subtitle">
        <strong>
          {catalog.heroes.find((h) => h.id === id)?.name ??
            "Waiting for your hero"}
        </strong>
        {data && (
          <span title="Build win rate and recorded matches, last 30 days">
            {((100 * data.stats.wins) / data.stats.matches).toFixed(1)}% ·{" "}
            {data.stats.matches.toLocaleString()} games
          </span>
        )}
      </div>
      {data ? (
        <>
          <select
            aria-label="Build stage"
            value={group}
            onChange={(e) => setGroup(Number(e.target.value))}
          >
            {data.groups.map((g, i) => (
              <option key={i} value={i}>
                {g.name}
              </option>
            ))}
          </select>
          <div className="hud-items">
            {selected?.ids.map((id, i) => {
              const item = catalog.items.find((v) => v.id === id);
              return item ? (
                <OverlayItem
                  key={`${id}:${i}`}
                  item={item}
                  owned={local?.items.includes(id)}
                />
              ) : (
                <span key={i}>#{id}</span>
              );
            })}
          </div>
          <small
            className="hud-note"
            title={`${data.name} · #${data.stats.hero_build_id}\nCommunity build; last 30 days, results span build versions.`}
          >
            {data.name}
          </small>
        </>
      ) : (
        <p className="hud-empty">
          {!id
            ? "Join a match to see your build."
            : result?.hero === id && result.error
              ? result.error
              : "Loading build…"}
        </p>
      )}
    </section>
  );
}
