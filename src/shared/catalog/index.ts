import data from "./catalog.json";
import type { Catalog } from "./types";

export const catalog = data as Catalog;
export const heroById = new Map(catalog.heroes.map((hero) => [hero.id, hero]));
export const abilityById = new Map(
  catalog.abilities.map((ability) => [ability.id, ability]),
);
export const itemById = new Map(catalog.items.map((item) => [item.id, item]));
export const itemByClass = new Map(
  catalog.items.flatMap((item) =>
    item.className ? [[item.className, item] as const] : [],
  ),
);
