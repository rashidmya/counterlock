import { useEffect, useState, type RefObject } from "react";
import { fetchLiveMatch } from "../services/live-api";
import type { LiveMatch } from "../utils/live-match";

const LIVE_REFRESH = 60_000;

export interface LiveState {
  // Undefined until the first answer; null when no live match was found.
  match?: LiveMatch | null;
  lastMatchId?: number;
  error?: string;
  // The first look, or Retry. The minute's checks go unannounced.
  loading: boolean;
  announcement: string;
  retry(): void;
}

/**
 * The account's live match, asked for again every minute while `shown` is
 * on screen. The last answer stays through a check or Retry. (Per account:
 * ProfilePage keys the view by account.)
 */
export function useLiveMatch(
  accountId: number,
  shown: RefObject<HTMLElement | null>,
  enabled = true,
): LiveState {
  const [live, setLive] = useState<Omit<LiveState, "retry">>({
    loading: enabled,
    announcement: "",
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const left = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let due = true;
    let busy = false;
    let first = true;
    // In a page the app hides, the tab has no box.
    const visible = () =>
      document.visibilityState === "visible" &&
      !!shown.current?.getClientRects().length;
    const wake = () => {
      if (!due || busy || !visible() || left.signal.aborted) return;
      due = false;
      busy = true;
      const announce = first;
      first = false;
      setLive((last) => ({
        ...last,
        loading: announce,
        announcement: announce
          ? last.match === undefined
            ? "Looking for a live match…"
            : "Checking again…"
          : "",
      }));
      fetchLiveMatch(accountId, undefined, left.signal).then(
        (match) => {
          if (left.signal.aborted) return;
          setLive((last) => ({
            match,
            lastMatchId: match?.matchId ?? last.lastMatchId,
            loading: false,
            announcement: announce
              ? match
                ? "Live match found."
                : "No live match found."
              : "",
          }));
          next();
        },
        (error: unknown) => {
          if (left.signal.aborted) return;
          const message =
            error instanceof Error ? error.message : String(error);
          setLive((last) => ({
            ...last,
            error: message,
            loading: false,
            announcement:
              announce || last.error !== message
                ? `${last.match === undefined ? "Live matches unavailable" : "Couldn't check again"}: ${message}`
                : "",
          }));
          next();
        },
      );
    };
    const next = () => {
      busy = false;
      timer = setTimeout(() => {
        due = true;
        wake();
      }, LIVE_REFRESH);
    };
    // No recurring timer while hidden. Both browser visibility and a
    // desktop page gaining its box wake a check that is due.
    const observer = new ResizeObserver(wake);
    if (shown.current) observer.observe(shown.current);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      left.abort();
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
  }, [accountId, attempt, shown, enabled]);
  return { ...live, retry: () => setAttempt((count) => count + 1) };
}
