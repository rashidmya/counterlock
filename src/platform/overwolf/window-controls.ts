import type { MouseEvent } from "react";

export function hideCurrentWindow() {
  if (typeof overwolf !== "undefined")
    overwolf.windows.getCurrentWindow((result) => {
      if (result.success) overwolf.windows.hide(result.window.id);
    });
}
export function dragCurrentWindow(event: MouseEvent) {
  if (
    typeof overwolf !== "undefined" &&
    event.button === 0 &&
    !(event.target as HTMLElement).closest("button, input, a")
  )
    overwolf.windows.getCurrentWindow((result) => {
      if (result.success) overwolf.windows.dragMove(result.window.id);
    });
}
