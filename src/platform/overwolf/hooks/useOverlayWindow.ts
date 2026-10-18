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
    const update = () => setOpacity(readOverlayOpacity());
    window.addEventListener("storage", update);
    overwolf.windows.getCurrentWindow((r) => {
      if (!r.success) return;
      id.current = r.window.id;
      try {
        const p = JSON.parse(localStorage.getItem(positionKey) ?? "null");
        if (p && Number.isInteger(p.x) && Number.isInteger(p.y))
          overwolf.windows.changePosition(id.current, p.x, p.y, () => {});
      } catch {}
    });
    return () => window.removeEventListener("storage", update);
  }, [positionKey]);
  const save = () =>
    overwolf.windows.getCurrentWindow((r) => {
      if (r.success)
        localStorage.setItem(
          positionKey,
          JSON.stringify({ x: r.window.left, y: r.window.top }),
        );
    });
  return { opacity, id, save };
}
