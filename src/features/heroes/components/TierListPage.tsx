import { useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import { useAsync } from "@/shared/api/useAsync";
import { PageTitle } from "@/shared/ui/PageTitle";
import { fetchHeroSummaries } from "../services/hero-analytics";
import {
  RoleButtons,
  TierList,
  TierTiles,
  catalogTiles,
  type RoleFilter,
} from "./TierList";

export function TierListPage({
  navigate,
  catalogWhileLoading = false,
}: {
  navigate: Navigate;
  catalogWhileLoading?: boolean;
}) {
  const [role, setRole] = useState<RoleFilter>("all");
  const summaries = useAsync(() => fetchHeroSummaries({ minBadge: 0 }), []);
  return (
    <LinkScope navigate={navigate}>
      <section className="heroes-page tier-list-page">
        <PageTitle title="Tier List" ribbon="Last 30 days · by win rate" />
        <p className="page-lede">
          Who's strong right now. Win rate · pick rate under each hero.
        </p>
        <div className="heroes-toolbar">
          <RoleButtons value={role} onChange={setRole} />
        </div>
        {summaries.loading && <p className="muted">Loading hero stats…</p>}
        {summaries.error && (
          <p className="notice warning" role="status">
            Hero stats unavailable: {summaries.error}
            <button type="button" onClick={summaries.retry}>
              Retry
            </button>
          </p>
        )}
        {summaries.loading && catalogWhileLoading && (
          <div className="tier-list">
            <div className="tier-row">
              <TierTiles tiles={catalogTiles()} />
            </div>
          </div>
        )}
        {!summaries.loading && (
          <TierList
            summaries={summaries.data ?? []}
            role={role}
            failed={!!summaries.error}
          />
        )}
        {summaries.data && (
          <p className="data-note">
            Tiers by win rate over the last 30 days, all ranks.
          </p>
        )}
      </section>
    </LinkScope>
  );
}
