import { afterEach, describe, expect, it, vi } from "vitest";
import { assetUrl } from "@/shared/ui/assets";

afterEach(() => vi.unstubAllEnvs());

describe("assetUrl", () => {
  it("is relative to the parent folder by default", () => {
    expect(assetUrl("./items/1.webp")).toBe("../items/1.webp");
    expect(assetUrl("icon.svg")).toBe("../icon.svg");
  });

  it("uses VITE_ASSET_BASE when set", () => {
    vi.stubEnv("VITE_ASSET_BASE", "/");
    expect(assetUrl("./items/1.webp")).toBe("/items/1.webp");
  });
});
