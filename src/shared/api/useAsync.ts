import { useEffect, useState } from "react";

type Settled<T> = { data?: T; error?: string; loading: boolean };
export type AsyncState<T> = Settled<T> & { retry(): void };

const same = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/**
 * Loads for `deps`. Each load gets a signal, aborted once its result can't
 * be shown any more (new deps, Retry or unmount), so the requests it still
 * waits for can be dropped.
 */
export function useAsync<T>(
  load: ((signal: AbortSignal) => Promise<T>) | null,
  deps: unknown[],
): AsyncState<T> {
  // Each result remembers the deps it was loaded for.
  const [state, setState] = useState<Settled<T> & { key?: unknown[] }>({
    loading: !!load,
  });
  const [attempt, setAttempt] = useState(0);
  const key = [...deps, attempt];
  useEffect(() => {
    if (!load) {
      setState({ loading: false, key });
      return;
    }
    let stale = false;
    const left = new AbortController();
    setState({ loading: true, key });
    load(left.signal).then(
      (data) => {
        if (!stale) setState({ data, loading: false, key });
      },
      (error: unknown) => {
        if (!stale)
          setState({
            error: error instanceof Error ? error.message : String(error),
            loading: false,
            key,
          });
      },
    );
    return () => {
      stale = true;
      left.abort();
    };
  }, key);
  const retry = () => setAttempt((count) => count + 1);
  // Until the effect catches up with new deps, the last result belongs to the
  // old ones: report loading rather than show it for a render.
  if (!state.key || !same(state.key, key)) return { loading: !!load, retry };
  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    retry,
  };
}
