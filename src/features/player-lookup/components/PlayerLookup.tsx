import { catalog } from "@/shared/catalog";
import { Icon } from "@/shared/ui/Icon";
import { Team } from "@/features/roster/components/Team";
import type { usePlayerLookup } from "../hooks/usePlayerLookup";

export function PlayerLookup({
  model,
}: {
  model: ReturnType<typeof usePlayerLookup>;
}) {
  const {
    lookupId,
    setLookupId,
    lookupHero,
    setLookupHero,
    lookup,
    lookupError,
    lookupBusy,
    findPlayer,
  } = model;
  return (
    <section className="lookup">
      <p className="eyebrow">LOOK UP A PLAYER</p>
      <h1>Know their hero history.</h1>
      <p className="muted">
        Use an exact Steam ID to check recorded rank, hero win rate, and games
        played.
      </p>
      <form className="panel" onSubmit={findPlayer}>
        <label>
          Steam ID
          <input
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="SteamID64 or account ID"
            required
          />
        </label>
        <label>
          Hero
          <select
            value={lookupHero}
            onChange={(e) => setLookupHero(Number(e.target.value))}
          >
            {[...catalog.heroes]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
          </select>
        </label>
        <button className="primary" disabled={lookupBusy}>
          {lookupBusy ? "Looking up…" : "Look up player"}
          <Icon name="arrow" />
        </button>
      </form>
      {lookupError && (
        <p role="alert" className="notice warning">
          {lookupError}
        </p>
      )}
      {lookup && (
        <Team
          title="Player history"
          subtitle="STANDARD · RECORDED HISTORY"
          players={lookup.players}
          state={lookup}
          enemy={false}
          selected={null}
          select={() => {}}
        />
      )}
      <p className="data-note">
        Rank is from the latest recorded ranked match. Missing or protected data
        appears as unavailable. Results are cached for five minutes. K/D/A is
        not included in this lookup.
      </p>
    </section>
  );
}
