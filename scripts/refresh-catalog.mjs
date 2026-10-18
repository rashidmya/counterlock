import { mkdir, writeFile } from "node:fs/promises";

const base = "https://api.deadlock-api.com/v1/assets";
export const plainText = (text = "") =>
  text
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
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
export function compact(heroes, items, ranks) {
  return {
    fetchedAt: new Date().toISOString(),
    heroes: heroes.map((h) => ({
      id: h.id,
      name: h.name,
      tags: h.tags,
      image: h.images?.icon_image_small_webp ?? h.images?.icon_image_small,
      popularItems: compactPopularity(h.popular_items),
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
  await mkdir("src/data", { recursive: true });
  await writeFile(
    "src/data/catalog.json",
    JSON.stringify(compact(...data), null, 2) + "\n",
  );
  console.log(
    "Updated hero, item and rank catalog. Review matchup rules before releasing a patch.",
  );
}
