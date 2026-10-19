import { mkdir, writeFile } from "node:fs/promises";

const base = "https://api.deadlock-api.com/v1/assets";
export const plainText = (text = "") =>
  text
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const compactPopularity = (data) =>
  data
    ? {
        timestamp: data.timestamp ?? null,
        ...Object.fromEntries(
          ["early_game", "mid_game", "late_game"].map((phase) => [
            phase,
            (data[phase] ?? []).map(({ item_id, pick_pct }) => ({
              item_id,
              pick_pct,
            })),
          ]),
        ),
      }
    : null;
const signatureKeys = ["signature1", "signature2", "signature3", "signature4"];
const formatStat = (property) => {
  const value = Number(property?.value);
  if (!property?.label || !Number.isFinite(value) || value === 0)
    return undefined;
  const sign = property.prefix?.includes("{s:sign}") && value > 0 ? "+" : "";
  return {
    label: property.label,
    value: `${sign}${value}${property.postfix ?? ""}`,
    icon: property.icon,
  };
};
const compactStats = (item) => {
  const names = (item.tooltip_sections ?? []).flatMap((section) =>
    (section.section_attributes ?? []).flatMap((attribute) => [
      ...(attribute.properties ?? []),
      ...(attribute.elevated_properties ?? []),
    ]),
  );
  return [...new Set(names)]
    .map((name) => formatStat(item.properties?.[name]))
    .filter(Boolean);
};
export function compact(heroes, items, ranks) {
  const abilityByClass = new Map(
    items.filter((i) => i.type === "ability").map((i) => [i.class_name, i]),
  );
  const signatureOf = (hero) =>
    signatureKeys
      .map((key) => abilityByClass.get(hero.items?.[key]))
      .filter(Boolean);
  const heroIds = new Set(heroes.map((h) => h.id));
  const abilityIds = new Set(
    heroes.flatMap((h) => signatureOf(h).map((a) => a.id)),
  );
  return {
    fetchedAt: new Date().toISOString(),
    heroes: heroes.map((h) => ({
      id: h.id,
      name: h.name,
      tags: h.tags,
      image: h.images?.icon_image_small_webp ?? h.images?.icon_image_small,
      role: h.hero_type,
      cardImage: h.images?.icon_hero_card_webp ?? h.images?.icon_hero_card,
      backgroundImage:
        h.images?.background_image_webp ?? h.images?.background_image,
      tagline: h.description?.role,
      abilityIds: signatureOf(h).map((a) => a.id),
      popularItems: compactPopularity(h.popular_items),
    })),
    abilities: items
      .filter(
        (i) =>
          i.type === "ability" &&
          abilityIds.has(i.id) &&
          heroIds.has(i.hero ?? i.heroes?.[0]),
      )
      .map((i) => ({
        id: i.id,
        heroId: i.hero ?? i.heroes?.[0],
        name: i.name,
        image: i.image_webp ?? i.image,
        quip: plainText(i.description?.quip),
        description: plainText(i.description?.desc),
        upgrades: [
          i.description?.t1_desc,
          i.description?.t2_desc,
          i.description?.t3_desc,
        ].map(plainText),
      })),
    items: items
      .filter((i) => i.type === "upgrade" && i.shopable && !i.disabled)
      .map((i) => ({
        id: i.id,
        name: i.name,
        cost: i.cost ?? 0,
        category: i.item_slot_type,
        image:
          i.shop_image_webp ??
          i.shop_image ??
          i.shop_image_small_webp ??
          i.image_webp ??
          i.image,
        description: plainText(i.description?.desc),
        className: i.class_name,
        tier: i.item_tier,
        active: i.is_active_item,
        components: i.component_items ?? [],
        stats: compactStats(i),
      })),
    ranks: ranks.map((r) => ({
      tier: r.tier,
      name: r.name,
      image: r.images?.large_webp ?? r.images?.large,
    })),
  };
}
if (process.argv[1]?.endsWith("refresh-catalog.mjs")) {
  const data = [];
  for (const endpoint of ["heroes?only_active=true", "items", "ranks"]) {
    const response = await fetch(`${base}/${endpoint}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`Catalog refresh failed: ${response.status} ${endpoint}`);
    data.push(await response.json());
  }
  await mkdir("src/shared/catalog", { recursive: true });
  await writeFile(
    "src/shared/catalog/catalog.json",
    JSON.stringify(compact(...data), null, 2) + "\n",
  );
  console.log(
    "Updated hero, item and rank catalog. Review matchup rules before releasing a patch.",
  );
}
