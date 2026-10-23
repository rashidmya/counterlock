import { describe, expect, it } from "vitest";
import {
  dotRadius,
  linePath,
  nearestGame,
} from "@/features/profile/components/Sparkline";

const x = (index: number) => index * 10;
const y = (value: number) => value;

describe("linePath", () => {
  it("joins consecutive values", () => {
    expect(linePath([1, 2, 3], x, y)).toBe("M0.0,1.0L10.0,2.0L20.0,3.0");
    // Zero is a value, not a missing game.
    expect(linePath([0, 0], x, y)).toBe("M0.0,0.0L10.0,0.0");
  });

  it("breaks at games without a value", () => {
    expect(linePath([1, 2, null, 4, 5], x, y)).toBe(
      "M0.0,1.0L10.0,2.0M30.0,4.0L40.0,5.0",
    );
  });

  it("draws a short tick for a value with no neighbour", () => {
    expect(linePath([null, 2, null], x, y)).toBe("M8.0,2.0h4");
    expect(linePath([7], x, y)).toBe("M-2.0,7.0h4");
    expect(linePath([1, null, 3], x, y)).toBe("M-2.0,1.0h4M18.0,3.0h4");
  });

  it("is empty without values", () => {
    expect(linePath([null, null], x, y)).toBe("");
  });
});

describe("dotRadius", () => {
  it("shrinks dots as games crowd together, down to 2 px", () => {
    expect(dotRadius(20)).toBe(3);
    expect(dotRadius(6)).toBeCloseTo(2.4);
    expect(dotRadius(2.5)).toBe(2);
  });
});

describe("nearestGame", () => {
  it("picks the game nearest the pointer, within the chart", () => {
    // Five games on a 112 px chart: 6 px padding, games 25 px apart.
    expect(nearestGame(6, 112, 5)).toBe(0);
    expect(nearestGame(18, 112, 5)).toBe(0);
    expect(nearestGame(19, 112, 5)).toBe(1);
    expect(nearestGame(106, 112, 5)).toBe(4);
    expect(nearestGame(-20, 112, 5)).toBe(0);
    expect(nearestGame(500, 112, 5)).toBe(4);
    expect(nearestGame(50, 112, 1)).toBe(0);
  });
});
