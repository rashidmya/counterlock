import { test } from "vitest";
import assert from "node:assert/strict";
import {
  chooseBuild,
  parseBuild,
} from "@/features/builds/services/build-analytics";
const row = {
  hero_id: 77,
  hero_build_id: 100,
  wins: 60,
  losses: 40,
  matches: 100,
  bucket: 0,
};
test("build stats select most observed build for the exact hero, not highest winrate", () => {
  assert.equal(
    chooseBuild(
      [
        { ...row, hero_id: 2, matches: 900, wins: 500, losses: 400 },
        { ...row, hero_build_id: 101, wins: 19, losses: 1, matches: 20 },
        row,
      ],
      77,
    ),
    row,
  );
  assert.equal(chooseBuild([{ ...row, matches: 99 }], 77), undefined);
});
test("build contents must match the measured build and preserve its groups", () => {
  const raw = {
    hero_build: {
      hero_id: 77,
      hero_build_id: 100,
      name: "Build",
      details: {
        mod_categories: [
          { name: "#Citadel_HeroBuilds_EarlyGame", mods: [{ ability_id: 42 }] },
        ],
      },
    },
  };
  assert.deepEqual(parseBuild(raw, row).groups, [
    { name: "Early game", description: "", ids: [42] },
  ]);
  assert.throws(
    () => parseBuild(raw, { ...row, hero_build_id: 101 }),
    /identity/,
  );
});

test("unmapped Citadel build group keys become readable names", () => {
  const raw = {
    hero_build: {
      hero_id: 77,
      hero_build_id: 100,
      name: "Build",
      details: {
        mod_categories: [
          { name: "#Citadel_HeroBuilds_Early", mods: [{ ability_id: 1 }] },
          { name: "#Citadel_HeroBuilds_LateGame", mods: [{ ability_id: 2 }] },
          {
            name: "#Citadel_HeroBuilds_SituationalPicks",
            mods: [{ ability_id: 3 }],
          },
          { name: "Custom group", mods: [{ ability_id: 4 }] },
        ],
      },
    },
  };
  assert.deepEqual(
    parseBuild(raw, row).groups.map((group) => group.name),
    ["Early", "Late game", "Situational picks", "Custom group"],
  );
});
