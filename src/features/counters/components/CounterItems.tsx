import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useAsync } from "@/shared/api/useAsync";
import { catalog, heroById, itemById } from "@/shared/catalog";
import type { Hero } from "@/shared/catalog/types";
import { Picture } from "@/shared/ui/Picture";
import {
  rankLabel,
  type AnalyticsQuery,
} from "@/features/heroes/utils/analytics";
import { fetchCounterData } from "../services/matchup-items";
import { counterItemsVs, MAX_ENEMIES } from "../utils/matchup-items";
import { recommend } from "../utils/recommendations";
import { CounterCard } from "./CounterCard";

const portrait = (hero: Hero) => hero.cardImage ?? hero.image;
const cardLabel = (index: number, category: string) =>
  index === 0 ? "CONSIDER FIRST" : category.toUpperCase();
const heroName = (id: number) => heroById.get(id)?.name ?? "";

export function CounterItems({
  hero,
  query,
  picks,
  setPicks,
  liveEnemies,
  liveAllies,
  exclude,
}: {
  hero: Hero;
  query: AnalyticsQuery;
  picks: number[];
  setPicks(picks: number[]): void;
  liveEnemies: number[];
  liveAllies: number[];
  // Main-build items to leave out; null until the main build has settled.
  exclude: ReadonlySet<number> | null;
}) {
  // Picks are shared between hero pages, so this hero is hidden, not removed.
  const shown = (ids: number[]) =>
    ids
      .filter((id) => id !== hero.id && heroById.has(id))
      .slice(0, MAX_ENEMIES);
  // Only your own team's heroes face the live enemies; to an enemy hero
  // they're teammates, so its page keeps the picker.
  const liveShown = liveAllies.includes(hero.id) ? shown(liveEnemies) : [];
  // A live team with nothing left to show falls back to manual picks.
  const live = liveShown.length > 0;
  const enemies = live ? liveShown : shown(picks);
  const full = enemies.length >= MAX_ENEMIES;
  const data = useAsync(
    enemies.length ? () => fetchCounterData(hero.id, enemies, query) : null,
    [hero.id, query.minBadge, enemies.join(",")],
  );
  const picksVs = useMemo(
    () =>
      data.data && exclude
        ? counterItemsVs(data.data.baseline, data.data.versus, exclude)
        : [],
    [data.data, exclude],
  );
  const choices = useMemo(
    () =>
      catalog.heroes
        .filter((entry) => entry.id !== hero.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [hero.id],
  );

  const [open, setOpen] = useState(false);
  const chooserId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  // Closing the chooser or removing the focused slot hands focus back to the picker.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (addRef.current ?? clearRef.current)?.focus();
  });
  const close = () => {
    refocus.current = true;
    setOpen(false);
  };
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    close();
  };
  const remove = (id: number) => {
    refocus.current = true;
    setPicks(picks.filter((pick) => pick !== id));
  };
  const toggle = (id: number) => {
    if (picks.includes(id)) return setPicks(picks.filter((p) => p !== id));
    if (full) return;
    // A hidden pick of this hero must not push the new one past the limit.
    const kept =
      picks.length >= MAX_ENEMIES ? picks.filter((p) => p !== hero.id) : picks;
    setPicks([...kept, id]);
  };

  let results: ReactNode;
  if (!enemies.length)
    results = (
      <p className="muted">
        Pick up to {MAX_ENEMIES} enemy heroes to see items that do well against
        them.
      </p>
    );
  else if (!exclude || data.loading || (!data.data && !data.error))
    results = <p className="muted">Loading…</p>;
  else if (picksVs.length)
    results = (
      <div className="counter-cards">
        {picksVs.flatMap((pick, index) => {
          const item = itemById.get(pick.itemId);
          const team = pick.scope === "team";
          return item
            ? [
                <CounterCard
                  key={item.id}
                  item={item}
                  label={cardLabel(index, item.category)}
                  targets={pick.against.map(heroName)}
                >
                  +{(pick.lift * 100).toFixed(1)}% vs{" "}
                  {team ? "these heroes" : heroName(pick.against[0])} ·{" "}
                  {pick.matches.toLocaleString()}
                  {team ? "+" : ""} games
                </CounterCard>,
              ]
            : [];
        })}
      </div>
    );
  else {
    const fallback = recommend(
      enemies.map((id) => ({ heroId: id, heroName: heroName(id) })),
      catalog.items,
      6400,
      [...exclude],
    );
    // Clear counters exist, but the main build already lists all of them.
    const covered =
      !!data.data &&
      counterItemsVs(data.data.baseline, data.data.versus, new Set()).length >
        0;
    results = (
      <>
        <p className="data-note">
          {data.error ? (
            <span>
              Match data unavailable: {data.error.replace(/\.$/, "")}. Based on
              hero traits instead.{" "}
              <button type="button" className="retry" onClick={data.retry}>
                Retry
              </button>
            </span>
          ) : covered ? (
            "Every item with a clear gain against these heroes is already in the main build. These are based on hero traits."
          ) : (
            "Based on hero traits — match data shows no clear counter items against these heroes yet."
          )}
        </p>
        {fallback.length ? (
          <div className="counter-cards">
            {fallback.map((entry, index) => (
              <CounterCard
                key={entry.item.id}
                item={entry.item}
                label={cardLabel(index, entry.item.category)}
                targets={entry.targets}
              >
                {entry.reasons.join(" ")}
              </CounterCard>
            ))}
          </div>
        ) : (
          <p className="muted">No suggestions for these heroes yet.</p>
        )}
      </>
    );
  }

  return (
    <div className="counter-items">
      <p className="data-note">
        Items not already in the main build that gain the most win rate for{" "}
        {hero.name} against these heroes overall, then items that clearly beat
        one of them. Each is compared with all {hero.name} games, allowing for
        the matchup itself, and only clear gains are shown ·{" "}
        {rankLabel(query.minBadge)} · last 30 days.
      </p>
      <div className="enemy-picker">
        <span className="picker-label">Enemy team</span>
        {live ? (
          <>
            {enemies.map((id) => {
              const enemy = heroById.get(id)!;
              return (
                <span
                  key={id}
                  className="enemy-slot filled"
                  role="img"
                  aria-label={enemy.name}
                  title={enemy.name}
                >
                  <Picture src={portrait(enemy)} label={enemy.name} />
                </span>
              );
            })}
            <p className="picker-note">Enemy team from your live match.</p>
          </>
        ) : (
          <>
            {enemies.map((id) => {
              const enemy = heroById.get(id)!;
              return (
                <button
                  key={id}
                  type="button"
                  className="enemy-slot filled"
                  aria-label={`Remove ${enemy.name}`}
                  title={`Remove ${enemy.name}`}
                  onClick={() => remove(id)}
                >
                  <Picture src={portrait(enemy)} label={enemy.name} />
                </button>
              );
            })}
            {!full && (
              <>
                <button
                  ref={addRef}
                  type="button"
                  className="enemy-slot add"
                  aria-label="Add enemy hero"
                  aria-expanded={open}
                  aria-controls={open ? chooserId : undefined}
                  onClick={() => setOpen(!open)}
                  onKeyDown={onEscape}
                >
                  +
                </button>
                {Array.from(
                  { length: MAX_ENEMIES - enemies.length - 1 },
                  (_, index) => (
                    <span
                      key={index}
                      className="enemy-slot"
                      aria-hidden="true"
                    />
                  ),
                )}
              </>
            )}
            {enemies.length > 0 && (
              <button
                ref={clearRef}
                type="button"
                className="text-button"
                onClick={() => {
                  refocus.current = true;
                  setPicks([]);
                }}
              >
                Clear
              </button>
            )}
          </>
        )}
      </div>
      {!live && open && (
        <div className="enemy-chooser" id={chooserId} onKeyDown={onEscape}>
          <div
            className="enemy-choices"
            role="group"
            aria-label="Choose enemy heroes"
          >
            {choices.map((entry) => {
              const pressed = enemies.includes(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="enemy-choice"
                  aria-pressed={pressed}
                  aria-label={entry.name}
                  title={entry.name}
                  disabled={!pressed && full}
                  onClick={() => toggle(entry.id)}
                >
                  <Picture src={portrait(entry)} label={entry.name} />
                  <span className="enemy-choice-name">{entry.name}</span>
                </button>
              );
            })}
          </div>
          <div className="enemy-chooser-actions">
            <button type="button" className="text-button" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
      {results}
    </div>
  );
}
