import { useEffect, useRef, useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import type { AsyncState } from "@/shared/api/useAsync";
import { useScrollBack } from "@/shared/ui/useScrollBack";
import type { HistoryFilter, HistoryMatch } from "../types";
import type { PerformanceRange } from "../utils/performance-metrics";
import { FIRST_SORT, HeroesTab, type HeroSort } from "./HeroesTab";
import { LiveTab } from "./LiveTab";
import { MatchHistory, PAGE_SIZE } from "./MatchHistory";
import { OverviewTab } from "./OverviewTab";
import { PerformanceTab } from "./PerformanceTab";

type Subtab = "overview" | "matches" | "performance" | "heroes" | "live";
const subtabs: { id: Subtab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "matches", label: "Matches" },
  { id: "performance", label: "Performance" },
  { id: "heroes", label: "Heroes" },
  { id: "live", label: "Live" },
];

interface ViewState {
  subtab: Subtab;
  filter: HistoryFilter;
  // The Matches tab's rows, a page more for each "Show more".
  shown: number;
  // The Heroes tab's.
  sort: HeroSort;
  range: PerformanceRange;
  // Null for all heroes.
  heroId: number | null;
}
const FIRST_VIEW: ViewState = {
  subtab: "overview",
  filter: "all",
  shown: PAGE_SIZE,
  sort: FIRST_SORT,
  range: 20,
  heroId: null,
};
// Each profile's tab, filters, rows shown and sort as last left, for the
// session: coming back from a match report (a page of its own on the
// website) finds them as they were. Switching tabs keeps them anyway.
const views = new Map<number, ViewState>();

export function ProfileView({
  accountId,
  history,
  header,
  navigate,
  restore,
  live,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
  header: React.ReactNode;
  navigate: Navigate;
  // Coming back (from the profile's match report, or with the browser's
  // Back): open as it was left. Any other way in starts at Overview.
  restore: boolean;
  // The Live tab, when the app has better than the Watch list (your own
  // account, from Overwolf's live data).
  live?: React.ReactNode;
}) {
  const [view, setView] = useState(
    () => (restore && views.get(accountId)) || FIRST_VIEW,
  );
  // Onto the latest view, so two changes in one event both count.
  const latest = useRef(view);
  // This visit's view is the one to come back to, changed or not.
  useEffect(() => {
    views.set(accountId, latest.current);
  }, [accountId]);
  // And its scroll position: on the website the profile loads again, so
  // the router's own restore finds it still too short.
  useScrollBack(`profile:${accountId}`, restore);
  const { subtab, filter, shown, sort, range, heroId } = view;
  const update = (change: Partial<ViewState>) => {
    const next = { ...latest.current, ...change };
    latest.current = next;
    views.set(accountId, next);
    setView(next);
  };
  const setSubtab = (next: Subtab) => update({ subtab: next });
  const setFilter = (next: HistoryFilter) => {
    // Another filter shows its first page.
    if (next !== latest.current.filter)
      update({ filter: next, shown: PAGE_SIZE });
  };
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
                  {...{ filter, shown, accountId }}
                  onFilter={setFilter}
                  onShowMore={(next) => update({ shown: next })}
                />
              ) : (
                <p className="muted">No recorded matches</p>
              ))}
          </div>
        )}
        {subtab === "heroes" && (
          <HeroesTab
            {...{ accountId, history, filter, sort }}
            onFilter={setFilter}
            onSort={(next) => update({ sort: next })}
          />
        )}
        {subtab === "performance" && (
          <PerformanceTab
            {...{ accountId, history, range, heroId }}
            onRange={(next) => update({ range: next })}
            onHero={(next) => update({ heroId: next })}
          />
        )}
        {subtab === "live" && (live ?? <LiveTab accountId={accountId} />)}
      </section>
    </LinkScope>
  );
}
