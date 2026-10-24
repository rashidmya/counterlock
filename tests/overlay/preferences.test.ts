import { afterEach, expect, it, vi } from "vitest";
import {
  readOverlayOpacity,
  readOverlayEnabled,
} from "@/features/overlay/preferences";
afterEach(() => vi.unstubAllGlobals());
it.each([
  [null, 96],
  ["garbage", 96],
  ["", 96],
  ["0", 35],
  ["25", 35],
  ["120", 100],
  ["75", 75],
])("reads opacity %s safely", (value, expected) => {
  vi.stubGlobal("localStorage", { getItem: () => value });
  expect(readOverlayOpacity()).toBe(expected);
});
it("enables only explicitly opted-in panels and handles inaccessible storage", () => {
  const data = new Map([
    ["scout.overlay.recommended-build", "true"],
    ["scout.overlay.healing", "true"],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
  });
  expect(readOverlayEnabled("hero-damage")).toBe(false);
  expect(readOverlayEnabled("healing")).toBe(true);
  data.set("scout.overlay.hero-damage", "yes");
  expect(readOverlayEnabled("hero-damage")).toBe(false);
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("blocked");
    },
  });
  expect(readOverlayEnabled("healing")).toBe(false);
  expect(readOverlayOpacity()).toBe(96);
});
