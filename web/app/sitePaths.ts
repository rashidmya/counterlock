import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };
import { slugify } from "../../src/shared/catalog/slugs";

// Relative imports only: react-router.config.ts cannot resolve the `@` alias.
export function sitePaths(): string[] {
  return [
    "/",
    "/heroes",
    "/items",
    "/about",
    ...catalog.heroes.map((hero) => `/heroes/${slugify(hero.name)}`),
    ...catalog.items.map((item) => `/items/${slugify(item.name)}`),
  ];
}
