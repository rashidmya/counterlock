import { useEffect, useState, type RefObject } from "react";
import { fetchLiveMatch } from "../services/live-api";
import type { LiveMatch } from "../utils/live-match";

// Asked again every minute while the tab is shown.
const LIVE_REFRESH = 60_000;
// A check that falls due while the tab is hidden (behind another page of
// the desktop app, or in a browser tab in the background) waits until it's
// back, looking this often.
const HIDDEN_CHECK = 5_000;

interface Live {
  // Undefined until the first answer; null when no live match was found.
  match?: LiveMatch | null;
  error?: string;
  // The first look, or Retry. The minute's checks go unannounced.
  loading: boolean;
}

/**
 * The account's live match, asked for again every minute while `shown` is
 * on screen. The last answer stays through a check or Retry. (Per account:
 * ProfilePage keys the view by account.)
 */
export function useLiveMatch(
  accountId: number,
  shown: RefObject<HTMLElement | null>,
) {
  const [live, setLive] = useState<Live>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const left = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // In a page the app hides, the tab has no box.
    const visible = () =>
      document.visibilityState === "visible" &&
      !!shown.current?.getClientRects().length;
    const next = (ms: number) => {
      timer = setTimeout(() => (visible() ? check() : next(HIDDEN_CHECK)), ms);
    };
    const check = () =>
      fetchLiveMatch(accountId, undefined, left.signal).then(
        (match) => {
          if (left.signal.aborted) return;
          setLive({ match, loading: false });
          next(LIVE_REFRESH);
        },
        (error: unknown) => {
          if (left.signal.aborted) return;
          const message =
            error instanceof Error ? error.message : String(error);
          setLive((last) => ({ ...last, error: message, loading: false }));
          next(LIVE_REFRESH);
        },
      );
    setLive((last) => ({ ...last, loading: true }));
    check();
    return () => {
      left.abort();
      clearTimeout(timer);
    };
  }, [accountId, attempt, shown]);
  return { ...live, retry: () => setAttempt((count) => count + 1) };
}
