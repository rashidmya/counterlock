import { useEffect, useRef, useState } from "react";
import {
  overlayPositionKey,
  readOverlayOpacity,
} from "@/features/overlay/preferences";

export function useOverlayWindow(name: string) {
  const [opacity, setOpacity] = useState(readOverlayOpacity);
  const id = useRef("");
  const positionKey = overlayPositionKey(name);
  useEffect(() => {
    let active = true;
    const update = () => setOpacity(readOverlayOpacity());
    window.addEventListener("storage", update);
    overwolf.windows.getCurrentWindow((r) => {
      if (!active || !r.success) return;
      id.current = r.window.id;
      try {
        const p = JSON.parse(localStorage.getItem(positionKey) ?? "null");
        if (p && Number.isInteger(p.x) && Number.isInteger(p.y))
          overwolf.windows.changePosition(id.current, p.x, p.y, () => {});
      } catch {}
    });
    return () => {
      active = false;
      window.removeEventListener("storage", update);
    };
  }, [positionKey]);
  const save = () =>
    new Promise<void>((resolve) =>
      overwolf.windows.getCurrentWindow((r) => {
        try {
          if (r.success)
            localStorage.setItem(
              positionKey,
              JSON.stringify({ x: r.window.left, y: r.window.top }),
            );
        } catch {
          /* Native coordinates remain valid for this session. */
        }
        resolve();
      }),
    );
  return { opacity, id, save };
}
