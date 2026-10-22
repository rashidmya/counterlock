import { heroById } from "@/shared/catalog";
import { Icon } from "@/shared/ui/Icon";
import { Picture } from "@/shared/ui/Picture";
import { threatLabels } from "../utils/recommendations";
import type { Threat } from "../types";
import type { useCounters } from "../hooks/useCounters";
import { CounterCard } from "./CounterCard";

export function CounterPanel({
  model,
}: {
  model: ReturnType<typeof useCounters>;
}) {
  const {
    teams,
    selected,
    setSelected,
    selectedPlayer,
    targets,
    budget,
    setBudget,
    manual,
    setManual,
    recommendations,
    unknownProfiles,
  } = model;
  return (
    <aside className="counters panel">
      <div className="counter-heading">
        <div className="counter-icon">
          <Icon name="shield" />
        </div>
        <div>
          <p className="eyebrow">BUILD WITH INTENT</p>
          <h2>Counter items</h2>
        </div>
      </div>
      <p className="muted">
        {selectedPlayer
          ? `Items to consider against ${selectedPlayer.heroName}.`
          : "Items to consider against their lineup."}
      </p>
      {teams.enemies.length > 0 && (
        <div
          className="enemy-filters"
          role="group"
          aria-label="Enemy hero filters"
        >
          <button
            className="enemy-filter"
            aria-label="All enemies"
            aria-pressed={!selectedPlayer}
            title="Counter the entire enemy team"
            onClick={() => setSelected(null)}
          >
            All
          </button>
          {teams.enemies.map((enemy) => (
            <button
              className="enemy-filter"
              key={enemy.slot}
              aria-label={`Counter items for ${enemy.heroName}`}
              aria-pressed={selectedPlayer?.slot === enemy.slot}
              title={enemy.heroName}
              onClick={() =>
                setSelected(selected === enemy.slot ? null : enemy.slot)
              }
            >
              <Picture
                key={enemy.heroId}
                className="enemy-filter-portrait"
                src={heroById.get(enemy.heroId)?.image}
                label={enemy.heroName}
              />
            </button>
          ))}
        </div>
      )}
      <div className="focus">
        <span>{selectedPlayer?.heroName ?? "Entire enemy team"}</span>
        {selectedPlayer ? (
          <button
            aria-label="Clear hero selection"
            onClick={() => setSelected(null)}
          >
            <Icon name="close" />
          </button>
        ) : (
          <span>{teams.enemies.length} HEROES</span>
        )}
      </div>
      <label className="budget">
        ITEM BUDGET
        <select
          aria-label="Item budget"
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
        >
          <option value={1600}>Up to 1,600 souls</option>
          <option value={3200}>Up to 3,200 souls</option>
          <option value={6400}>All budgets</option>
        </select>
      </label>
      <div className="recommendations">
        {recommendations.length ? (
          recommendations.map((entry, i) => (
            <CounterCard
              key={entry.item.id}
              item={entry.item}
              label={
                i === 0 ? "CONSIDER FIRST" : entry.item.category.toUpperCase()
              }
              targets={entry.targets}
            >
              {entry.reasons.join(" ")}
            </CounterCard>
          ))
        ) : (
          <div className="empty">
            <p>No suggestions yet</p>
            <small>
              {targets.length
                ? "Increase the budget or select a threat below."
                : "Join a match or select a threat below."}
            </small>
          </div>
        )}
      </div>
      {unknownProfiles.length > 0 && (
        <p className="rule-note">
          No starter profile for{" "}
          {unknownProfiles.map((p) => p.heroName).join(", ")}. Choose the
          threats you face below.
        </p>
      )}
      <details>
        <summary>Adjust for their build</summary>
        <p className="muted">
          Add threats that match what you see in the game.
        </p>
        <div className="threats">
          {Object.entries(threatLabels).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={manual.includes(key as Threat)}
              onClick={() =>
                setManual((current) =>
                  current.includes(key as Threat)
                    ? current.filter((t) => t !== key)
                    : [...current, key as Threat],
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      </details>
      <p className="rule-note">
        Rules-based suggestions. Consider your hero, build, timing, and
        available slots. Owned items are excluded when reported.
      </p>
    </aside>
  );
}
