import { expect, it } from "vitest";
import manifest from "../../public/manifest.json";
import { OVERLAY_PANELS, panelForWindow } from "@/features/overlay/panels";
it("resolves only declared performance panels with the right native sizes and entrypoint", () => {
  expect(
    Object.keys(manifest.data.windows).filter(
      (n) => !["background", "desktop"].includes(n),
    ),
  ).toEqual([
    "hero_damage",
    "objective_damage",
    "healing",
    "you_vs_average",
    "spawn_timers",
  ]);
  for (const panel of OVERLAY_PANELS) {
    const window = manifest.data.windows[
      panel.windowName as keyof typeof manifest.data.windows
    ] as {
      file: string;
      size: { width: number; height: number };
      start_position: { left: number; top: number };
    };
    expect(window.file).toBe("in_game/in_game.html");
    expect(window.size).toEqual({ width: panel.width, height: panel.height });
    expect(window.start_position).toEqual({ left: panel.left, top: panel.top });
    expect(panelForWindow(panel.windowName)?.id).toBe(panel.id);
    expect(panel.windowName.length).toBeLessThanOrEqual(20);
  }
  expect(panelForWindow("counter_overlay")).toBeUndefined();
  expect(panelForWindow("desktop")).toBeUndefined();
});
