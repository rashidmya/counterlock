import { catalog } from "./index";

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function duplicateSlugs(names: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const slug of names.map(slugify)) {
    if (seen.has(slug)) duplicates.add(slug);
    seen.add(slug);
  }
  return [...duplicates];
}

const index = (entries: { id: number; name: string }[]) => ({
  slugById: new Map(entries.map(({ id, name }) => [id, slugify(name)])),
  idBySlug: new Map(entries.map(({ id, name }) => [slugify(name), id])),
});
const heroes = index(catalog.heroes);
const items = index(catalog.items);

export const heroSlug = (id: number) => heroes.slugById.get(id);
export const itemSlug = (id: number) => items.slugById.get(id);
export const heroIdBySlug = (slug: string) => heroes.idBySlug.get(slug);
export const itemIdBySlug = (slug: string) => items.idBySlug.get(slug);
