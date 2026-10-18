import { test } from "vitest";
import assert from "node:assert/strict";
import { heroName, enemyPlayers } from "@/features/match/utils/hero-identity";
test("counter labels resolve the reported hero ID instead of missing or stale names", () => {
  const heroes = [
    { id: 1, name: "Infernus" },
    { id: 2, name: "Seven" },
  ];
  assert.equal(heroName(1, heroes, "Unknown hero"), "Infernus");
  assert.equal(heroName(2, heroes, "Infernus"), "Seven");
  assert.equal(heroName(999, heroes, undefined), "Hero #999");
});
test("counter targets contain only the opposing team, never allies or unassigned players", () => {
  const local = { team: 2, local: true };
  const enemy = { team: 3, local: false };
  assert.deepEqual(enemyPlayers([local, enemy, { team: 0 }, { team: 2 }]), [
    enemy,
  ]);
  assert.deepEqual(enemyPlayers([enemy, { team: 0 }]), []);
  assert.deepEqual(
    enemyPlayers([{ team: 3, local: true }, { team: 2 }, { team: 0 }]),
    [{ team: 2 }],
  );
});
