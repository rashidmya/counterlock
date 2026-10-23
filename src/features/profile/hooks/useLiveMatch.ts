import { useEffect, useState } from "react";
import { fetchLiveMatch } from "../services/live-api";
import type { LiveMatch } from "../utils/live-match";

interface Live {
  // Undefined until the first answer; null when no live match was found.
  match?: LiveMatch | null;
  error?: string;
  loading: boolean;
}

/**
 * The account's live match. Retry keeps the last answer until the next one
 * comes. (Per account: ProfilePage keys the view by account.)
 */
export function useLiveMatch(accountId: number) {
  const [live, setLive] = useState<Live>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const left = new AbortController();
    setLive((last) => ({ ...last, loading: true }));
    fetchLiveMatch(accountId, undefined, left.signal).then(
      (match) => {
        if (!left.signal.aborted) setLive({ match, loading: false });
      },
      (error: unknown) => {
        if (left.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setLive((last) => ({ ...last, error: message, loading: false }));
      },
    );
    return () => left.abort();
  }, [accountId, attempt]);
  return { ...live, retry: () => setAttempt((count) => count + 1) };
}
