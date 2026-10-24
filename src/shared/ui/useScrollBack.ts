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
    let pending = y > 0;
    let stop = () => {};
    if (pending) {
      const attempt = () => {
        if (page.scrollHeight - window.innerHeight < y) return;
        window.scrollTo(0, y);
        stop();
      };
      const observer = new ResizeObserver(attempt);
      const timer = setTimeout(() => stop(), 10_000);
      stop = () => {
        pending = false;
        observer.disconnect();
        clearTimeout(timer);
        for (const event of TAKEOVER)
          window.removeEventListener(event, takeover);
      };
      const takeover = (event: Event) => {
        // Browser history buttons and shortcuts navigate without taking
        // over scrolling, just like the browser toolbar's Back/Forward.
        if (event instanceof PointerEvent && event.button > 2) return;
        if (event instanceof KeyboardEvent && (event.altKey || event.metaKey))
          return;
        // A horizontal trackpad gesture can be a browser swipe back.
        if (
          event instanceof WheelEvent &&
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
        )
          return;
        stop();
      };
      for (const event of TAKEOVER)
        window.addEventListener(event, takeover, { passive: true });
      observer.observe(document.body);
    }
    return () => {
      // A position still to come back stays kept: the window is only where
      // the page, too short yet, left it (left early, or StrictMode's
      // remount in development).
      if (!pending) positions.set(key, window.scrollY);
      stop();
    };
    // `restore` only matters as the page mounts.
  }, [key]);
}
