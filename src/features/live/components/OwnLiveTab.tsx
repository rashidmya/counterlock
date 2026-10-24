import { useRef, type ComponentProps, type RefObject } from "react";
import { useFocusOnRemoval } from "@/shared/ui/useFocusOnRemoval";
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
  const message = useRef<HTMLParagraphElement>(null);
  const inMatch = status === "in-match";
  return (
    <div className="live-tab own">
      <p className="live-status" ref={message} tabIndex={-1} role="status">
        {inMatch ? "Live match in progress." : "Not in a game."}
      </p>
      {inMatch ? (
        <OwnMatch status={message} overview={overview} />
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

function OwnMatch({
  status,
  overview,
}: {
  status: RefObject<HTMLElement | null>;
  overview: Omit<ComponentProps<typeof MatchOverview>, "embedded">;
}) {
  const match = useRef<HTMLDivElement>(null);
  useFocusOnRemoval(match, status);
  return (
    <div ref={match} className="own-live-match">
      <MatchOverview embedded {...overview} />
    </div>
  );
}
