import { useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import type { AsyncState } from "@/shared/api/useAsync";
import type { HistoryFilter, HistoryMatch } from "../types";
import type { PerformanceRange } from "../utils/performance-metrics";
import { HeroesTab } from "./HeroesTab";
import { MatchHistory } from "./MatchHistory";
import { OverviewTab } from "./OverviewTab";
import { PerformanceTab } from "./PerformanceTab";

type Subtab = "overview" | "matches" | "performance" | "heroes";
const subtabs: { id: Subtab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "matches", label: "Matches" },
  { id: "performance", label: "Performance" },
  { id: "heroes", label: "Heroes" },
];

interface ViewState {
  subtab: Subtab;
  filter: HistoryFilter;
  range: PerformanceRange;
  // Null for all heroes.
  heroId: number | null;
}
const FIRST_VIEW: ViewState = {
  subtab: "overview",
  filter: "all",
  range: 20,
  heroId: null,
};
// Each profile's tab and filters, kept for the session: switching tabs, or
// coming back from a match report (a page of its own on the website),
// finds them as they were.
const views = new Map<number, ViewState>();

export function ProfileView({
  accountId,
  history,
  header,
  navigate,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
  header: React.ReactNode;
  navigate: Navigate;
}) {
  const [view, setView] = useState(() => views.get(accountId) ?? FIRST_VIEW);
  const { subtab, filter, range, heroId } = view;
  const update = (change: Partial<ViewState>) => {
    // Onto the latest stored view, so two changes in one event both count.
    const next = { ...(views.get(accountId) ?? view), ...change };
    views.set(accountId, next);
    setView(next);
  };
  const setSubtab = (next: Subtab) => update({ subtab: next });
  const setFilter = (next: HistoryFilter) => update({ filter: next });
  return (
    <LinkScope navigate={navigate}>
      <section className="profile">
        {header}
        <div className="subtabs" role="tablist">
          {subtabs.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={subtab === id}
              className={subtab === id ? "active" : ""}
              onClick={() => setSubtab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {subtab === "overview" && (
          <OverviewTab
            {...{ accountId, history }}
            onShowAll={() => setSubtab("matches")}
          />
        )}
        {subtab === "matches" && (
          <div className="matches-tab">
            {history.loading && <p className="muted">Loading match history…</p>}
            {history.error && (
              <p className="notice warning" role="status">
                Match history unavailable
                <button type="button" onClick={history.retry}>
                  Retry
                </button>
              </p>
            )}
            {history.data &&
              (history.data.length ? (
                <MatchHistory
                  matches={history.data}
                  {...{ filter, accountId }}
                  onFilter={setFilter}
                />
              ) : (
                <p className="muted">No recorded matches</p>
              ))}
          </div>
        )}
        {subtab === "heroes" && (
          <HeroesTab {...{ accountId, history, filter }} onFilter={setFilter} />
        )}
        {subtab === "performance" && (
          <PerformanceTab
            {...{ accountId, history, range, heroId }}
            onRange={(next) => update({ range: next })}
            onHero={(next) => update({ heroId: next })}
          />
        )}
      </section>
    </LinkScope>
  );
}
