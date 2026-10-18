import data from "./catalog.json";
import type { Catalog } from "./types";

export const catalog: Catalog = data;
export const heroById = new Map(catalog.heroes.map((hero) => [hero.id, hero]));
