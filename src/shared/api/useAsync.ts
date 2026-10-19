import { useEffect, useState } from "react";

type Settled<T> = { data?: T; error?: string; loading: boolean };
export type AsyncState<T> = Settled<T> & { retry(): void };

export function useAsync<T>(
  load: (() => Promise<T>) | null,
  deps: unknown[],
): AsyncState<T> {
  const [state, setState] = useState<Settled<T>>({ loading: !!load });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!load) {
      setState({ loading: false });
      return;
    }
    let stale = false;
    setState({ loading: true });
    load().then(
      (data) => {
        if (!stale) setState({ data, loading: false });
      },
      (error: unknown) => {
        if (!stale)
          setState({
            error: error instanceof Error ? error.message : String(error),
            loading: false,
          });
      },
    );
    return () => {
      stale = true;
    };
  }, [...deps, attempt]);
  return { ...state, retry: () => setAttempt((count) => count + 1) };
}
