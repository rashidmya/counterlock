import type { Config } from "@react-router/dev/config";
import catalog from "../src/shared/catalog/catalog.json" with { type: "json" };
import { duplicateSlugs, slugify } from "../src/shared/catalog/slugs";

const duplicates = [
  ...duplicateSlugs(catalog.heroes.map((hero) => hero.name)).map(
    (slug) => `hero "${slug}"`,
  ),
  ...duplicateSlugs(catalog.items.map((item) => item.name)).map(
    (slug) => `item "${slug}"`,
  ),
];
if (duplicates.length)
  throw new Error(`Duplicate catalog slugs: ${duplicates.join(", ")}`);

const heroPaths = catalog.heroes.map((hero) => `/heroes/${slugify(hero.name)}`);
const itemPaths = catalog.items.map((item) => `/items/${slugify(item.name)}`);

export default {
  appDirectory: "app",
  ssr: false,
  prerender: ["/", "/heroes", "/items", "/about", ...heroPaths, ...itemPaths],
} satisfies Config;
