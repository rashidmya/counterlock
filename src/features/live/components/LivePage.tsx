import type { MatchState } from "@/features/match/types";
import type { useCounters } from "@/features/counters/hooks/useCounters";
import { MatchOverview } from "@/features/match/components/MatchOverview";
import type { Navigate } from "@/app/navigation";
import { Icon } from "@/shared/ui/Icon";
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
}: Props) {
  if (status === "in-match")
    return (
      <MatchOverview
        {...{ state, showBuild, showCounters, counters, refresh }}
      />
    );
  const running = status === "waiting";
  return (
    <section className="live-empty">
      <Icon name="eye" />
      <h1>{running ? "Waiting for a match" : "Deadlock isn't running"}</h1>
      <p className="muted">
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
