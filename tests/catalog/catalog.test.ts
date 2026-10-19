import { describe, expect, it } from "vitest";
import { abilityById, catalog, itemByClass } from "@/shared/catalog";
import { rankImage } from "@/shared/ui/gameIcons";

const roles = ["assassin", "brawler", "marksman", "mystic"];

describe("catalog", () => {
  it("every active hero has a role and four resolvable abilities", () => {
    for (const hero of catalog.heroes) {
      expect(roles, hero.name).toContain(hero.role);
      expect(hero.abilityIds, hero.name).toHaveLength(4);
      for (const id of hero.abilityIds ?? []) {
        const ability = abilityById.get(id);
        expect(ability?.name, `${hero.name} ${id}`).toBeTruthy();
        expect(ability?.image, `${hero.name} ${id}`).toBeTruthy();
      }
    }
  });

  it("Haze has the expected identity", () => {
    const haze = catalog.heroes.find((hero) => hero.id === 13);
    expect(haze?.role).toBe("assassin");
    expect(haze?.tagline).toBe("Sneaks in and sprays bullets");
    expect(haze?.abilityIds?.map((id) => abilityById.get(id)?.name)).toEqual([
      "Sleep Dagger",
      "Smoke Bomb",
      "Fixation",
      "Bullet Dance",
    ]);
    expect(haze?.cardImage).toMatch(/haze_card\.webp$/);
  });

  it("ability text is plain", () => {
    for (const ability of catalog.abilities) {
      expect(ability.description).not.toContain("<");
      expect(ability.quip).not.toContain("<");
      for (const upgrade of ability.upgrades)
        expect(upgrade).not.toContain("<");
    }
  });

  it("items carry tier, class and formatted stats", () => {
    const leech = catalog.items.find((item) => item.name === "Leech");
    expect(leech?.tier).toBe(4);
    expect(leech?.components).toEqual([
      "upgrade_vampire",
      "upgrade_health_stealing_magic",
    ]);
    expect(leech?.stats).toContainEqual(
      expect.objectContaining({ label: "Bonus Health", value: "+180" }),
    );
    let components = 0;
    let resolved = 0;
    for (const item of catalog.items) {
      expect(item.tier, item.name).toBeGreaterThanOrEqual(1);
      expect(item.tier, item.name).toBeLessThanOrEqual(5);
      for (const component of item.components ?? []) {
        components += 1;
        if (itemByClass.has(component)) resolved += 1;
      }
    }
    expect(resolved / components).toBeGreaterThanOrEqual(0.9);
  });

  it("builds rank badge URLs", () => {
    expect(rankImage(5, 3)).toBe(
      "https://api.deadlock-api.com/v1/assets/ranks/5/3/image?format=webp",
    );
  });
});
