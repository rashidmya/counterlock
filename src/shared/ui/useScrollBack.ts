import { useLayoutEffect } from "react";

// The window's scroll position as each page was left, by key.
const positions = new Map<string, number>();
// Ways the viewer takes the scrolling over.
const TAKEOVER = ["wheel", "touchstart", "keydown", "pointerdown"];

/**
 * Keeps the window's scroll position under `key` when the page unmounts.
 * With `restore` (read when it mounts), scrolls back to it once the page is
 * tall enough: a page whose content loads after its first render is still
 * too short when the router restores the position. It gives up if the
 * viewer scrolls first, or after 10 seconds.
 */
export function useScrollBack(key: string, restore: boolean) {
  // Layout effects: the position is read before this page is scrolled, and
  // kept before the next page resets it.
  useLayoutEffect(() => {
    const y = restore ? (positions.get(key) ?? 0) : 0;
    const page = document.documentElement;
    let stop = () => {};
    if (y > 0) {
      const attempt = () => {
        if (page.scrollHeight - window.innerHeight < y) return;
        window.scrollTo(0, y);
        stop();
      };
      const observer = new ResizeObserver(attempt);
      const timer = setTimeout(() => stop(), 10_000);
      stop = () => {
        observer.disconnect();
        clearTimeout(timer);
        for (const event of TAKEOVER) window.removeEventListener(event, stop);
      };
      for (const event of TAKEOVER)
        window.addEventListener(event, stop, { passive: true });
      observer.observe(document.body);
    }
    return () => {
      stop();
      positions.set(key, window.scrollY);
    };
    // `restore` only matters as the page mounts.
  }, [key]);
}
