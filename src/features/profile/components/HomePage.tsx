import { useState } from "react";
import type { Navigate } from "@/app/navigation";
import { useAsync } from "@/shared/api/useAsync";
import { useProfileAccount } from "../hooks/useProfileAccount";
import { fetchMatchHistory } from "../services/profile-api";
import type { HistoryFilter } from "../types";
import { HeroesTab } from "./HeroesTab";
import { OverviewTab } from "./OverviewTab";
import { PerformanceTab } from "./PerformanceTab";
import { ProfileEmpty } from "./ProfileEmpty";
import { ProfileHeader } from "./ProfileHeader";

type Subtab = "overview" | "heroes" | "performance";
const subtabs: { id: Subtab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "heroes", label: "Heroes" },
  { id: "performance", label: "Performance" },
];

export function HomePage({ navigate }: { navigate: Navigate }) {
  const { account, setManual, clear } = useProfileAccount();
  const [subtab, setSubtab] = useState<Subtab>("overview");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const accountId = account?.accountId;
  const history = useAsync(
    accountId ? () => fetchMatchHistory(accountId) : null,
    [accountId],
  );
  if (!account) return <ProfileEmpty onSubmit={setManual} />;
  return (
    <section className="profile">
      <ProfileHeader account={account} onChange={clear} />
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
          accountId={account.accountId}
          {...{ history, filter, navigate }}
          onFilter={setFilter}
        />
      )}
      {subtab === "heroes" && (
        <HeroesTab
          accountId={account.accountId}
          {...{ history, filter, navigate }}
          onFilter={setFilter}
        />
      )}
      {subtab === "performance" && (
        <PerformanceTab accountId={account.accountId} history={history} />
      )}
    </section>
  );
}
