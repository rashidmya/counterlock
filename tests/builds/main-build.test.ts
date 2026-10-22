import { describe, expect, it } from "vitest";
import type { DeadlockApi } from "@/shared/api/DeadlockApi";
import { catalog, itemByClass } from "@/shared/catalog";
import { analyticsParams } from "@/features/heroes/utils/analytics";
import {
  PHASES,
  buildPhase,
  mainBuild,
  phaseParams,
} from "@/features/builds/utils/main-build";
import { fetchMainBuild } from "@/features/builds/services/main-build";

const row = (itemId: number, matches: number, buyS: number, rate = 0.55) => ({
  item_id: itemId,
  wins: matches * rate,
  losses: matches * (1 - rate),
  matches,
  avg_buy_time_s: buyS,
});
const plain = catalog.items.filter(
  (item) => item.cost > 0 && !item.components?.length,
);
const upgrade = catalog.items.find(
  (item) =>
    item.components?.length === 1 && itemByClass.has(item.components[0]),
)!;
const component = itemByClass.get(upgrade.components![0])!;
const others = plain.filter((item) => item.id !== component.id);
const chain = catalog.items.find((item) =>
  item.components?.some((name) =>
    itemByClass.get(name)?.components?.some((inner) => itemByClass.has(inner)),
  ),
)!;
const middle = chain
  .components!.map((name) => itemByClass.get(name)!)
  .find((part) => part.components?.some((inner) => itemByClass.has(inner)))!;
const root = itemByClass.get(
  middle.components!.find((inner) => itemByClass.has(inner))!,
)!;
const ids = (phase: { items: { itemId: number }[] }) =>
  phase.items.map((item) => item.itemId);

describe("mainBuild", () => {
  it("takes the eight most-bought items per phase, ordered by average buy time", () => {
    const rows = others
      .slice(0, 10)
      .map((item, i) => row(item.id, 1000 - i * 10, 500 - i * 20));
    const [early] = mainBuild([rows, [], []]);
    expect(ids(early)).toEqual(
      others
        .slice(0, 8)
        .map((item) => item.id)
        .reverse(),
    );
  });
  it("keeps an upgrade and drops its component in the same phase", () => {
    const [early] = mainBuild([
      [
        row(component.id, 1000, 100),
        row(upgrade.id, 900, 300),
        row(others[0].id, 800, 200),
      ],
      [],
      [],
    ]);
    expect(ids(early)).toEqual([others[0].id, upgrade.id]);
  });
  it("drops a component bought less often than its upgrade", () => {
    const [early] = mainBuild([
      [row(upgrade.id, 1000, 300), row(component.id, 900, 100)],
      [],
      [],
    ]);
    expect(ids(early)).toEqual([upgrade.id]);
  });
  it("drops components through a chain of upgrades", () => {
    const [early] = mainBuild([
      [
        row(root.id, 1000, 100),
        row(middle.id, 950, 200),
        row(chain.id, 900, 300),
      ],
      [],
      [],
    ]);
    expect(ids(early)).toEqual([chain.id]);
  });
  it("drops items listed in an earlier phase", () => {
    const [early, mid] = mainBuild([
      [row(others[0].id, 1000, 100)],
      [row(others[0].id, 2000, 700), row(others[1].id, 900, 800)],
      [],
    ]);
    expect(ids(early)).toEqual([others[0].id]);
    expect(ids(mid)).toEqual([others[1].id]);
  });
  it("ignores items bought in under 5% as many matches as the phase's top item", () => {
    const [early] = mainBuild([
      [
        row(others[0].id, 1000, 100),
        row(others[1].id, 49, 50),
        row(others[2].id, 50, 60),
      ],
      [],
      [],
    ]);
    expect(ids(early)).toEqual([others[2].id, others[0].id]);
  });
  it("skips unknown items and labels the three phases", () => {
    const phases = mainBuild([
      [row(4_000_000_001, 5000, 10), row(others[0].id, 1000, 100, 0.6)],
      [],
      [],
    ]);
    expect(phases.map((p) => [p.key, p.label, p.range])).toEqual([
      ["early", "Early", "0–10 min"],
      ["mid", "Mid", "10–20 min"],
      ["late", "Late", "20+ min"],
    ]);
    expect(phases[0].items).toEqual([
      { itemId: others[0].id, winRate: 0.6, matches: 1000, avgBuyS: 100 },
    ]);
    expect(phases[1].items).toEqual([]);
  });
  it("asks for each phase's purchase window", () => {
    expect(PHASES.map(phaseParams)).toEqual([
      "min_bought_at_s=0&max_bought_at_s=600",
      "min_bought_at_s=600&max_bought_at_s=1200",
      "min_bought_at_s=1200",
    ]);
  });
  it("fetches one item-stats request per phase with the rank filter", async () => {
    const calls: string[] = [];
    const api = {
      get: async (path: string) => {
        calls.push(path);
        return [];
      },
    } as unknown as DeadlockApi;
    const q = { minBadge: 71 };
    await fetchMainBuild(13, q, api);
    expect(calls).toEqual(
      PHASES.map(
        (phase) =>
          `/v1/analytics/item-stats?${analyticsParams(q)}&hero_id=13&${phaseParams(phase)}`,
      ),
    );
    expect(calls[0]).toContain("min_average_badge=71");
  });
});

describe("build phase timing", () => {
  it.each([
    ["00:00", "early"],
    ["09:59", "early"],
    ["10:00", "mid"],
    ["19:59", "mid"],
    ["20:00", "late"],
    ["75:30", "late"],
    ["", null],
    ["-1:00", null],
    ["10:60", null],
    ["unknown", null],
  ])("maps %s to %s", (clock, phase) => expect(buildPhase(clock)).toBe(phase));
});
