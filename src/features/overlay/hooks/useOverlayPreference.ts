import { useEffect, useState } from "react";
import { overlayPreferenceKey, readOverlayEnabled } from "../preferences";

export function useOverlayPreference(name: string) {
  const key = overlayPreferenceKey(name);
  const read = () => readOverlayEnabled(name);
  const [visible, setVisible] = useState(read);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setVisible(read());
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [key]);
  const set = (value: boolean) => {
    setVisible(value);
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* Session-only if storage is unavailable. */
    }
  };
  return [visible, set] as const;
}
