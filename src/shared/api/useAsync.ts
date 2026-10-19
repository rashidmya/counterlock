import { useEffect, useState } from "react";

type AsyncState<T> = { data?: T; error?: string; loading: boolean };

export function useAsync<T>(
  load: (() => Promise<T>) | null,
  deps: unknown[],
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: !!load });
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
  }, deps);
  return state;
}
