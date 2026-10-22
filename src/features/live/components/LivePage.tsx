import type { MatchState } from "@/features/match/types";
import type { AnalyticsQuery } from "@/features/heroes/utils/analytics";
import type { useCounters } from "@/features/counters/hooks/useCounters";
import { MatchOverview } from "@/features/match/components/MatchOverview";
import type { Navigate } from "@/app/navigation";
import { PageTitle } from "@/shared/ui/PageTitle";
import type { LiveStatus } from "../utils/live-status";

interface Props {
  state: MatchState;
  status: LiveStatus;
  showBuild: boolean;
  showCounters: boolean;
  counters: ReturnType<typeof useCounters>;
  refresh: () => void;
  navigate: Navigate;
  meId: number | null;
  query: AnalyticsQuery;
}

export function LivePage({
  state,
  status,
  showBuild,
  showCounters,
  counters,
  refresh,
  navigate,
  meId,
  query,
}: Props) {
  if (status === "in-match")
    return (
      <MatchOverview
        {...{ state, showBuild, showCounters, counters, refresh, query }}
      />
    );
  const running = status === "waiting";
  return (
    <section className="live-empty">
      <PageTitle
        title={running ? "Waiting for a match" : "Deadlock isn't running"}
      />
      <p className="page-lede">
        {running
          ? "Queue up. We'll switch to this tab when the lobby loads."
          : "Launch Deadlock and this tab will fill in as soon as you join a match."}
      </p>
      <button
        className="text-button"
        onClick={() =>
          navigate(
            !running
              ? { page: "heroes" }
              : meId === null
                ? { page: "home" }
                : { page: "profile", accountId: meId },
          )
        }
      >
        {running ? "View your profile" : "Browse heroes"}
      </button>
    </section>
  );
}
