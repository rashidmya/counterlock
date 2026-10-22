import { describe, expect, it } from "vitest";
import { clock, compact, percent } from "@/features/match-report/utils/format";
import {
  buffs,
  impact,
  verdicts,
} from "@/features/match-report/utils/insights";
import {
  defaultPerspective,
  displayName,
  optionLabel,
  possessive,
  viewNote,
} from "@/features/match-report/utils/perspective";
import { parseCurve, rankBand } from "@/features/match-report/utils/rank-curve";
import { parseMatchReport } from "@/features/match-report/utils/report";
import { stretches } from "@/features/match-report/utils/stretches";
import {
  DURATION_S,
  heroes,
  matchMetadata,
  rankCurveRows,
} from "../fixtures/match-report";

const ACCOUNT = 100000000;
const report = parseMatchReport(matchMetadata(ACCOUNT), 1001);
const [lead, second] = report.players;
const curve = { band: rankBand(73), points: parseCurve(rankCurveRows()) };

describe("format", () => {
  it("formats clock times, compact numbers and percentages", () => {
    expect([clock(0), clock(392), clock(2164)]).toEqual([
      "0:00",
      "6:32",
      "36:04",
    ]);
    expect([
      compact(59870),
      compact(906),
      compact(12.5),
      compact(-1500),
      compact(999.6),
      compact(99.96),
      compact(-0.04),
    ]).toEqual(["59.9K", "906", "12.5", "−1.5K", "1.0K", "100", "0"]);
    expect([percent(0.124), percent(-0.25)]).toEqual(["12%", "25%"]);
  });
});

describe("verdicts", () => {
  it("compares souls / min, hero damage and creep kills with the rank average at match end", () => {
    const [souls, damage, creeps] = verdicts(lead, DURATION_S, curve);
    expect(souls).toMatchObject({ label: "Souls / min", value: 1080 });
    expect(souls.change).toBeCloseTo(0.08);
    expect(damage).toMatchObject({ label: "Hero damage", value: 18000 });
    expect(damage.change).toBeCloseTo(0.2);
    expect(creeps).toMatchObject({ label: "Creep kills", value: 90 });
    expect(creeps.change).toBeCloseTo(-0.25);
  });

  it("has no change without a curve or past its last step", () => {
    expect(verdicts(lead, DURATION_S, null).map((v) => v.change)).toEqual([
      null,
      null,
      null,
    ]);
    expect(verdicts(lead, 9999, curve)[0].change).toBeNull();
  });

  it("counts permanent buffs against the average", () => {
    expect(buffs(lead, DURATION_S, curve)).toEqual({ count: 3, average: 3 });
    expect(buffs(lead, DURATION_S, null).average).toBeNull();
  });
});

describe("impact", () => {
  it("gives the player's share of their team's totals and kill participation", () => {
    const { rows, killParticipation } = impact(lead, report.players);
    expect(rows.map((row) => row.label)).toEqual([
      "Hero damage",
      "Objective damage",
      "Healing",
    ]);
    expect(rows[0].value).toBe(18000);
    expect(rows[0].share).toBeCloseTo(18000 / 87000);
    expect(rows[1].share).toBeCloseTo(3000 / 10500);
    expect(rows[2].share).toBeCloseTo(6000 / 21000);
    expect(killParticipation).toEqual({
      share: 0.5,
      involved: 14,
      teamKills: 28,
    });
  });
});

describe("stretches", () => {
  const withShares = (shares: number[]) => ({
    ...lead,
    values: {
      ...lead.values,
      souls: lead.times.map((t, i) => ((1000 * t) / 60) * shares[i]),
    },
  });
  const turn = (shares: number[], c = curve) =>
    stretches(withShares(shares), c).find((s) => s.label === "Turning point")
      ?.text;

  it("names the strongest and weakest moments, the turning point and deaths", () => {
    expect(stretches(lead, curve)).toEqual([
      {
        label: "Strongest",
        text: "Around 15:00: 20% more souls than the Emissary average.",
        tone: "good",
      },
      {
        label: "Weakest",
        text: "Around 3:00: 10% fewer souls than the average.",
        tone: "bad",
      },
      {
        label: "Turning point",
        text: "Back within the normal range from 20:00.",
      },
      { label: "Deaths", text: "4 deaths: 6:40, 21:40, 23:20, 25:00." },
      {
        label: "Rough patch",
        text: "3 deaths between 21:40 and 25:00.",
        tone: "bad",
      },
    ]);
  });

  it("describes where the player ended up against the normal range", () => {
    expect(turn([1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2])).toBe(
      "Ahead of the normal range all game.",
    );
    expect(turn([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8])).toBe(
      "Behind the normal range all game.",
    );
    expect(turn([1, 1.05, 0.95, 1, 1, 1, 1, 1])).toBe(
      "Within the normal range all game.",
    );
    expect(turn([0.8, 0.8, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2])).toBe(
      "Pulled ahead of the normal range at 9:00 and stayed there.",
    );
    expect(turn([1.2, 1.2, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8])).toBe(
      "Fell behind the normal range at 9:00 and stayed there.",
    );
    expect(turn([1.2, 0.8, 1.2, 0.8, 1.2, 0.8, 1, 1])).toBe(
      "Back within the normal range from 25:00.",
    );
  });

  it("goes by how the match ended, not the first crossing, and ignores wobbles inside the range", () => {
    expect(turn([0.8, 1.2, 0.8, 1.2, 0.8, 1.2, 1.2, 1.2])).toBe(
      "Pulled ahead of the normal range at 20:00 and stayed there.",
    );
    expect(turn([1.2, 0.8, 1.2, 0.8, 1.2, 0.8, 0.8, 0.8])).toBe(
      "Fell behind the normal range at 20:00 and stayed there.",
    );
    expect(turn([1.2, 1.2, 1.2, 0.98, 1.2, 1.2, 1.2, 1.2])).toBe(
      "Pulled ahead of the normal range at 15:00 and stayed there.",
    );
  });

  it("says until when when the average stops before the match ends", () => {
    const short = { ...curve, points: curve.points.filter((p) => p.t <= 900) };
    expect(turn([1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2], short)).toBe(
      "Ahead of the normal range until 15:00.",
    );
    expect(turn([0.8, 0.8, 1.2, 1.2, 1.2, 0.5, 0.5, 0.5], short)).toBe(
      "Pulled ahead of the normal range at 9:00 and stayed there until 15:00.",
    );
  });

  it("reads level within half a percent, and names the all-ranks average", () => {
    const [strongest, weakest] = stretches(
      withShares([1.002, 1.001, 1, 1, 1, 1, 1, 1]),
      { ...curve, band: rankBand(0) },
    );
    expect(strongest).toEqual({
      label: "Strongest",
      text: "Around 3:00: level with the all-ranks average.",
    });
    expect(weakest).toEqual({
      label: "Weakest",
      text: "Around 9:00: level with the average.",
    });
  });

  it("needs two snapshots with an average to compare; otherwise only deaths", () => {
    const first = { ...curve, points: curve.points.slice(0, 1) };
    expect(stretches(lead, first).map((s) => s.label)).toEqual([
      "Deaths",
      "Rough patch",
    ]);
  });

  it("without an average lists only deaths; one death reads singular", () => {
    expect(stretches({ ...second, deathTimes: [720] }, null)).toEqual([
      { label: "Deaths", text: "1 death: 12:00." },
    ]);
    expect(stretches({ ...second, deathTimes: [] }, null)).toEqual([
      { label: "Deaths", text: "No deaths." },
    ]);
  });
});

describe("perspective", () => {
  const names = new Map([
    [ACCOUNT, "Fargo"],
    [5001, "somdr"],
  ]);

  it("opens as me if I played, else the player I came from, else the whole match", () => {
    expect(defaultPerspective(report, ACCOUNT, 5001)).toBe(1);
    expect(defaultPerspective(report, 42, 5001)).toBe(2);
    expect(defaultPerspective(report, null, undefined)).toBeNull();
    expect(defaultPerspective(report, 42, 43)).toBeNull();
  });

  it("says You only for the remembered account", () => {
    expect(displayName(lead, names, ACCOUNT)).toBe("You");
    expect(displayName(lead, names, null)).toBe("Fargo");
    expect(displayName(report.players[5], names, null)).toBe(heroes[5].name);
    expect(displayName(lead, new Map([[ACCOUNT, ""]]), null)).toBe(
      heroes[0].name,
    );
    expect([
      possessive("You", true),
      possessive("You", false),
      possessive("somdr", false),
    ]).toEqual(["Your", "You's", "somdr's"]);
  });

  it("labels options by team, hero and name, and notes whose match it is", () => {
    expect(optionLabel(lead, names, ACCOUNT)).toBe(
      `Amber · ${heroes[0].name} · Fargo (you)`,
    );
    expect(optionLabel(report.players[7], names, ACCOUNT)).toBe(
      `Sapphire · ${heroes[7].name}`,
    );
    expect(viewNote(lead, names, ACCOUNT)).toBe("This is your match.");
    expect(viewNote(second, names, ACCOUNT)).toBe(
      "You're viewing somdr's match. Labels and verdicts are from their point of view.",
    );
    expect(viewNote(undefined, names, ACCOUNT)).toBe(
      "Whole-match view. Nobody is highlighted.",
    );
  });
});
