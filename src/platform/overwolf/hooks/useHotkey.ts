import { useEffect, useState } from "react";
import { inOverwolf } from "../store-bridge";
import { kHotkeys } from "../constants";

export function useHotkey() {
  const [hotkey, setHotkey] = useState("Ctrl + Shift + S");

  useEffect(() => {
    if (!inOverwolf) return;
    overwolf.settings.hotkeys.get((result) => {
      if (result.success) {
        const assignment =
          Object.values(result.games ?? {})
            .flat()
            .find((h) => h.name === kHotkeys.toggle) ??
          result.globals?.find((h) => h.name === kHotkeys.toggle);
        if (assignment) setHotkey(assignment.binding || "Unassigned");
      }
    });
  }, []);
  return hotkey;
}
