import { useLayoutEffect, useState, type RefObject } from "react";

/** The element's width in whole pixels, updated as it resizes; 0 until measured. */
export function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(Math.round(node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
