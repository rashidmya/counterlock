import type { Config } from "@react-router/dev/config";
import catalog from "../src/shared/catalog/catalog.json" with { type: "json" };
import { duplicateSlugs } from "../src/shared/catalog/slugs";
import { sitePaths } from "./app/sitePaths";

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

export default {
  appDirectory: "app",
  ssr: false,
  prerender: [...sitePaths(), "/sitemap.xml", "/robots.txt"],
} satisfies Config;
