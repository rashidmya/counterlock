import type { ComponentProps } from "react";
import { MatchOverview } from "@/features/match/components/MatchOverview";
import { LiveEmpty } from "@/features/profile/components/LiveTab";
import type { LiveStatus } from "../utils/live-status";

/**
 * The profile's Live tab for your own account in the app: the match from
 * Overwolf's live data, as on the Live page, rather than the Watch list.
 */
export function OwnLiveTab({
  status,
  ...overview
}: { status: LiveStatus } & Omit<
  ComponentProps<typeof MatchOverview>,
  "embedded"
>) {
  return (
    <div className="live-tab own">
      {status === "in-match" ? (
        <MatchOverview embedded {...overview} />
      ) : (
        <LiveEmpty title="Not in a game">
          {status === "waiting"
            ? "Deadlock is running: your match shows here as soon as it loads."
            : "Deadlock isn't running. Your match shows here once you're in one."}
        </LiveEmpty>
      )}
    </div>
  );
}
