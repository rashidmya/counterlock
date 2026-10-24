import { RetryButton } from "@/shared/ui/RetryButton";
import type { AsyncState } from "@/shared/api/useAsync";
import {
  PHASE_SIZE,
  type MainBuildPhase,
  type PhaseKey,
} from "../utils/main-build";
import { BuildItem } from "./BuildItem";

// Later phases also leave out items an earlier phase listed, hence "more".
const shortLine = (count: number, later: boolean) =>
  count === 0
    ? "Not enough data for this phase."
    : `Only ${count}${later ? " more" : ""} item${count === 1 ? " was" : "s were"} bought often enough in this phase.`;

export function MainBuild({
  state,
  owned = [],
  now = null,
}: {
  state: AsyncState<MainBuildPhase[]>;
  owned?: number[];
  now?: PhaseKey | null;
}) {
  if (state.loading)
    return (
      <p className="build-empty" role="status">
        Loading build…
      </p>
    );
  if (state.error)
    return (
      <p className="build-empty" role="status">
        Build unavailable: {state.error}{" "}
        <RetryButton
          className="retry"
          focusTarget='[role="tab"][aria-selected="true"], h1, h2, h3'
          onRetry={state.retry}
        />
      </p>
    );
  if (!state.data) return null;
  return (
    <div className="main-build">
      {state.data.map((phase, index) => (
        <div
          key={phase.key}
          className={`build-phase${phase.key === now ? " now" : ""}`}
          data-phase={phase.key}
        >
          <div className="phase-label">
            <b>{phase.label}</b>
            <span>{phase.range}</span>
            {phase.key === now && <em>Now</em>}
          </div>
          <div className="phase-items">
            {phase.items.map(({ itemId, winRate }) => {
              const isOwned = owned.includes(itemId);
              return (
                <BuildItem
                  key={itemId}
                  itemId={itemId}
                  owned={isOwned}
                  sub={isOwned ? "OWNED" : `${Math.round(winRate * 100)}% win`}
                />
              );
            })}
          </div>
          {phase.items.length < PHASE_SIZE && (
            <p className="phase-short">
              {shortLine(phase.items.length, index > 0)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
