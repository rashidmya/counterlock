import { heroById, itemById } from "@/shared/catalog";
import { routeToPath } from "./paths";

export const SITE_URL: string = (
  import.meta.env.VITE_SITE_URL?.trim() || "https://counterlock.example"
).replace(/\/+$/, "");

const SITE_NAME = "Counterlock";
const MAX_DESCRIPTION = 160;

export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article";
}

interface MetaTag {
  name?: string;
  property?: string;
  content: string;
}

export function metaTags({
  title,
  description,
  path,
  image,
  type = "website",
}: PageMetaInput): { title: string; tags: MetaTag[]; canonical: string } {
  const canonical = SITE_URL + path;
  const tags: MetaTag[] = [
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    { property: "og:type", content: type },
    { property: "og:site_name", content: SITE_NAME },
  ];
  if (image) tags.push({ property: "og:image", content: image });
  tags.push(
    {
      name: "twitter:card",
      content: image ? "summary_large_image" : "summary",
    },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  );
  if (image) tags.push({ name: "twitter:image", content: image });
  return { title, tags, canonical };
}

export function PageMeta(props: PageMetaInput) {
  const { title, tags, canonical } = metaTags(props);
  return (
    <>
      <title>{title}</title>
      {tags.map((tag) => (
        <meta key={tag.name ?? tag.property} {...tag} />
      ))}
      <link rel="canonical" href={canonical} />
    </>
  );
}

function limit(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_DESCRIPTION) return clean;
  const cut = clean.slice(0, MAX_DESCRIPTION - 1);
  const atWord = cut.slice(0, cut.lastIndexOf(" "));
  return `${(atWord || cut).replace(/[\s,;:.—-]+$/, "")}…`;
}

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export function heroMetaInput(heroId: number): PageMetaInput {
  const hero = heroById.get(heroId);
  if (!hero) throw new Error(`Unknown hero id ${heroId}`);
  const role = hero.role ? ` (${capitalise(hero.role)})` : "";
  const tagline = hero.tagline ? ` ${hero.tagline}` : "";
  return {
    title: `${hero.name} — build, counters & abilities | ${SITE_NAME}`,
    description: limit(
      `${hero.name}${role} in Deadlock: abilities, skill order, best build, counters, best items and win rate.${tagline}`,
    ),
    path: routeToPath({ page: "heroes", heroId }),
    image: hero.cardImage ?? hero.image,
  };
}

export function itemMetaInput(itemId: number): PageMetaInput {
  const item = itemById.get(itemId);
  if (!item) throw new Error(`Unknown item id ${itemId}`);
  const detail =
    item.description ||
    (item.stats ?? [])
      .slice(0, 2)
      .map((stat) => `${stat.label} ${stat.value}`)
      .join(", ");
  return {
    title: `${item.name} — stats, builds & win rate | ${SITE_NAME}`,
    description: limit(
      `${item.name} — ${capitalise(item.category)} item, ${item.cost} souls. ${detail}`,
    ),
    path: routeToPath({ page: "items", itemId }),
    image: item.image,
  };
}

const escapeXml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export function sitemapXml(paths: string[]): string {
  const urls = paths
    .map((path) => `  <url><loc>${escapeXml(SITE_URL + path)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}
