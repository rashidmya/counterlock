import { useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import { useAsync } from "@/shared/api/useAsync";
import { fetchMatchHistory } from "../services/profile-api";
import type { HistoryFilter } from "../types";
import { HeroesTab } from "./HeroesTab";
import { OverviewTab } from "./OverviewTab";
import { PerformanceTab } from "./PerformanceTab";

type Subtab = "overview" | "heroes" | "performance";
const subtabs: { id: Subtab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "heroes", label: "Heroes" },
  { id: "performance", label: "Performance" },
];

export function ProfileView({
  accountId,
  header,
  navigate,
}: {
  accountId: number;
  header: React.ReactNode;
  navigate: Navigate;
}) {
  const [subtab, setSubtab] = useState<Subtab>("overview");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const history = useAsync(() => fetchMatchHistory(accountId), [accountId]);
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
            {...{ accountId, history, filter }}
            onFilter={setFilter}
          />
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
