import { useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import type { AsyncState } from "@/shared/api/useAsync";
import type { HistoryFilter, HistoryMatch } from "../types";
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
  const [subtab, setSubtab] = useState<Subtab>("overview");
  const [filter, setFilter] = useState<HistoryFilter>("all");
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
          <PerformanceTab accountId={accountId} history={history} />
        )}
      </section>
    </LinkScope>
  );
}
