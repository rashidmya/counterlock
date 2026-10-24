import type { MatchState } from "@/features/match/types";
import { scheduledSpawns } from "../utils/spawn-timers";

const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export function SpawnTimers({ state }: { state: MatchState }) {
  if (state.gameMode === "street_brawl")
    return (
      <p className="hud-empty">
        Spawn schedules are unavailable in Street Brawl.
      </p>
    );
  const timers = scheduledSpawns(state);
  if (!timers.length)
    return <p className="hud-empty">Waiting for the match clock.</p>;
  return (
    <div className="hud-timers">
      {timers.map((timer) => (
        <div className="hud-timer" key={timer.id}>
          <div>
            <strong>{timer.label}</strong>
            <small>Next at {time(timer.atS)}</small>
          </div>
          <strong className="hud-countdown">
            {timer.remainingS === 0 ? "Scheduled now" : time(timer.remainingS)}
          </strong>
        </div>
      ))}
      <p className="hud-note">Scheduled spawns · availability isn't tracked.</p>
    </div>
  );
}
