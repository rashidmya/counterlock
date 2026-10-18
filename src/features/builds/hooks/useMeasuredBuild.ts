import { useEffect, useState } from "react";
import type { MatchState } from "@/features/match/types";
import { loadBuild, type MeasuredBuild } from "../services/build-analytics";

export function useMeasuredBuild(
  id: number | undefined,
  gameMode: MatchState["gameMode"],
  presentation: "desktop" | "compact",
) {
  const [result, setResult] = useState<{
    hero: number;
    data?: MeasuredBuild;
    error?: string;
  }>();
  useEffect(() => {
    if (!id) return;
    if (gameMode === "street_brawl") {
      setResult({
        hero: id,
        error:
          presentation === "compact"
            ? "Build data unavailable for Street Brawl."
            : "Build statistics for Street Brawl are unavailable.",
      });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setResult({ hero: id });
    const timer = setTimeout(() => controller.abort(), 20000);
    loadBuild(id, controller.signal)
      .then((data) => {
        if (active) setResult({ hero: id, data });
      })
      .catch((error: Error) => {
        if (active)
          setResult({
            hero: id,
            error:
              presentation === "compact"
                ? "Build unavailable. Reopen to retry."
                : controller.signal.aborted
                  ? "Build statistics request timed out."
                  : error.message,
          });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, gameMode, presentation]);
  return result?.hero === id ? result : undefined;
}
