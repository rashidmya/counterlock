import { RetryButton } from "@/shared/ui/RetryButton";
import { useState } from "react";
import type { AsyncState } from "@/shared/api/useAsync";
import { itemById } from "@/shared/catalog";
import {
  BUILD_WINDOW_DAYS,
  type PopularBuildsResult,
} from "../services/popular-builds";
import type { PopularBuild } from "../utils/popular-builds";
import { BuildItem } from "./BuildItem";

const plural = (count: number, word: string, many = `${word}s`) =>
  `${count.toLocaleString()} ${count === 1 ? word : many}`;

// Fixed month names: en-GB locale data writes September as "Sept".
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const updated = (seconds: number) => {
  const date = new Date(seconds * 1000);
  const day = String(date.getDate()).padStart(2, "0");
  return `${day} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

function note({ english, ranked }: PopularBuildsResult) {
  const how = ranked
    ? `Most-favourited builds updated in the last ${BUILD_WINDOW_DAYS} days, shown exactly as their authors set them up.`
    : `Community builds updated in the last ${BUILD_WINDOW_DAYS} days, shown exactly as their authors set them up. This hero has no favourite counts yet.`;
  return english
    ? how
    : `No English builds yet, so these are in other languages. ${how}`;
}

function meta(build: PopularBuild, authors: Map<number, string>) {
  const author = authors.get(build.authorId);
  const items = build.categories.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  return [
    author && `by ${author}`,
    build.updatedAt > 0 && `Updated ${updated(build.updatedAt)}`,
    `${plural(items, "item")} in ${plural(build.categories.length, "category", "categories")}`,
    build.favorites !== null && plural(build.favorites, "favourite"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function PopularBuilds({
  state,
}: {
  state: AsyncState<PopularBuildsResult>;
}) {
  const [selected, setSelected] = useState(0);
  if (state.loading)
    return (
      <p className="build-empty" role="status">
        Loading popular builds…
      </p>
    );
  if (state.error)
    return (
      <p className="build-empty" role="status">
        Popular builds unavailable: {state.error}{" "}
        <RetryButton
          className="retry"
          focusTarget='[role="tab"][aria-selected="true"], h1, h2, h3'
          onRetry={state.retry}
        />
      </p>
    );
  if (!state.data) return null;
  const { builds, authors } = state.data;
  if (!builds.length)
    return (
      <p className="build-empty">
        {`No community builds for this hero were updated in the last ${BUILD_WINDOW_DAYS} days.`}
      </p>
    );
  const index = selected < builds.length ? selected : 0;
  const build = builds[index];
  return (
    <>
      <p className="data-note">{note(state.data)}</p>
      <div
        className="popular-build-tabs"
        role="group"
        aria-label="Popular builds"
      >
        {builds.map((entry, i) => (
          <button
            key={entry.id}
            type="button"
            className="build-tab"
            aria-pressed={i === index}
            title={entry.name}
            onClick={() => setSelected(i)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <article className="popular-build">
        <div className="popular-build-meta">
          <h3>{build.name}</h3>
          <p>{meta(build, authors)}</p>
        </div>
        {/* Keyed by position: several categories can share a name. */}
        {build.categories.map((group, i) => (
          <section className="build-category" key={i}>
            <h4 className="build-category-name">{group.name}</h4>
            {group.description && (
              <p className="build-category-desc">{group.description}</p>
            )}
            {group.items.length > 0 && (
              <div className="build-category-items">
                {group.items.map((entry, j) => (
                  <BuildItem key={j} itemId={entry.itemId} note={entry.note} />
                ))}
              </div>
            )}
            {/* Notes as text too: the tile tooltip never shows on touch. */}
            {group.items.some((entry) => entry.note) && (
              <ul className="build-notes">
                {group.items.map(
                  ({ itemId, note }, j) =>
                    note && (
                      <li key={j}>
                        <b>{itemById.get(itemId)?.name ?? `Item #${itemId}`}</b>{" "}
                        {note}
                      </li>
                    ),
                )}
              </ul>
            )}
          </section>
        ))}
      </article>
    </>
  );
}
