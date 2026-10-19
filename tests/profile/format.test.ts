import { describe, expect, it } from "vitest";
import {
  compactSouls,
  duration,
  timeAgo,
} from "@/features/profile/utils/format";

describe("timeAgo", () => {
  const now = Date.UTC(2026, 9, 20, 12);
  it("uses the largest whole unit", () => {
    expect(timeAgo(now - 20_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5m ago");
    expect(timeAgo(now - 2 * 3600_000, now)).toBe("2h ago");
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe("3d ago");
    expect(timeAgo(now - 70 * 86_400_000, now)).toBe("2mo ago");
    expect(timeAgo(now - 800 * 86_400_000, now)).toBe("2y ago");
  });
  it("treats future timestamps as just now", () => {
    expect(timeAgo(now + 60_000, now)).toBe("just now");
  });
});

describe("duration", () => {
  it("formats mm:ss and stays finite", () => {
    expect(duration(1880)).toBe("31:20");
    expect(duration(0)).toBe("00:00");
    expect(duration(-5)).toBe("00:00");
  });
});

describe("compactSouls", () => {
  it("abbreviates thousands", () => {
    expect(compactSouls(34200)).toBe("34.2k");
    expect(compactSouls(950)).toBe("950");
    expect(compactSouls(0)).toBe("0");
  });
});
