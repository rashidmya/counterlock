import { isDeadlock, type GameInfo } from "../game";
import { useEffect, useState } from "react";
export function useDeadlockRunning() {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (typeof overwolf === "undefined") return;
    let active = true,
      revision = 0;
    const apply = (info: GameInfo | null | undefined) => {
      if (active) setRunning(isDeadlock(info));
    };
    const changed = (event: overwolf.games.GameInfoUpdatedEvent) => {
      revision++;
      apply(event.gameInfo);
    };
    overwolf.games.onGameInfoUpdated.addListener(changed);
    const current = revision;
    overwolf.games.getRunningGameInfo((info) => {
      if (current === revision) apply(info);
    });
    return () => {
      active = false;
      overwolf.games.onGameInfoUpdated.removeListener(changed);
    };
  }, []);
  return running;
}
