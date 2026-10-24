import { useLayoutEffect, type RefObject } from "react";

/** Recover only focus that still belongs to content being removed. */
export function useFocusOnRemoval(
  inside: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const node = inside.current;
    return () => {
      if (node?.contains(document.activeElement))
        target.current?.focus({ preventScroll: true });
    };
  }, [inside, target]);
}
