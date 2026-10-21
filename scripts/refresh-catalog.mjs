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
const parseNumber = (raw) => {
  const value = typeof raw === "number" ? raw : Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;
};
const withPostfix = (raw, text, postfix = "") => {
  const unit = String(raw)
    .trim()
    .replace(/^[-+]?[\d.]+/, "")
    .trim();
  return `${text}${unit || postfix}`;
};
const formatStat = (property) => {
  const value = parseNumber(property?.value);
  if (!property?.label || value === undefined || value === 0) return undefined;
  const sign = property.prefix?.includes("{s:sign}") && value > 0 ? "+" : "";
  return {
    label: property.label,
    value: withPostfix(property.value, `${sign}${value}`, property.postfix),
    icon: property.icon,
  };
};
const highlightsOf = (html = "") => [
  ...new Set(
    [...html.matchAll(/<span class="highlight">([\s\S]*?)<\/span>/g)]
      .map((match) => plainText(match[1]))
      .filter(Boolean),
  ),
];
const abilityStats = (item) => {
  const section = item.tooltip_details?.info_sections?.[0];
  const properties = item.properties ?? {};
  const keyStats = (section?.properties_block ?? [])
    .flatMap((block) => block.properties ?? [])
    .map((entry) => {
      const stat = formatStat(properties[entry.important_property]);
      const icon = entry.important_property_icon ?? stat?.icon;
      return stat && { ...stat, icon };
    })
    .filter(Boolean)
    .slice(0, 3);
  const minorStats = (section?.basic_properties ?? [])
    .map((name) => formatStat(properties[name]))
    .filter(Boolean);
  const cooldown = parseNumber(properties.AbilityCooldown?.value);
  return {
    cooldown: cooldown ? `${cooldown}s` : undefined,
    keyStats,
    minorStats,
  };
};
const upgradeText = (item, index) => {
  const written = plainText(item.description?.[`t${index + 1}_desc`]);
  if (written) return written;
  return (item.upgrades?.[index]?.property_upgrades ?? [])
    .filter((upgrade) => upgrade.upgrade_type !== "EAddToScale")
    .map((upgrade) => {
      const property = item.properties?.[upgrade.name];
      const bonus = parseNumber(upgrade.bonus);
      if (!property?.label || bonus === undefined || bonus === 0)
        return undefined;
      const sign = bonus > 0 ? "+" : "";
      return `${withPostfix(upgrade.bonus, `${sign}${bonus}`, property.postfix)} ${property.label}`;
    })
    .filter(Boolean)
    .join(" ");
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
        upgrades: [0, 1, 2].map((index) => upgradeText(i, index)),
        highlights: highlightsOf(i.description?.desc),
        ...abilityStats(i),
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
