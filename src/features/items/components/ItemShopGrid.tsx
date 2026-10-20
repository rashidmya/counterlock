import { RouteLink } from "@/app/links";
import type { Item } from "@/shared/catalog/types";
import { categoryIcon } from "@/shared/ui/gameIcons";
import { ItemIcon } from "@/shared/ui/ItemIcon";

export interface ShopTile {
  item: Item;
  note?: string;
}

const categories = [
  { value: "weapon", label: "Weapon" },
  { value: "vitality", label: "Vitality" },
  { value: "spirit", label: "Spirit" },
];

function Tile({ tile, badge }: { tile: ShopTile; badge: boolean }) {
  const { item, note } = tile;
  const icon = badge ? categoryIcon(item.category) : undefined;
  return (
    <RouteLink
      className="item-tile"
      route={{ page: "items", itemId: item.id }}
      title={`${item.name} · ${item.cost.toLocaleString("en-US")} souls`}
    >
      <span className="item-tile-art">
        <ItemIcon item={item} />
        {icon && <img className="item-category" src={icon} alt="" />}
      </span>
      <strong>{item.name}</strong>
      {note && <small>{note}</small>}
    </RouteLink>
  );
}

export function ItemShopGrid({
  tiles,
  layout,
}: {
  tiles: ShopTile[];
  layout: "shop" | "flat";
}) {
  if (layout === "flat")
    return (
      <div className="item-tiles shop-flat">
        {tiles.map((tile) => (
          <Tile key={tile.item.id} tile={tile} badge />
        ))}
      </div>
    );
  return (
    <div className="shop-columns">
      {categories.flatMap(({ value, label }) => {
        const own = tiles.filter((tile) => tile.item.category === value);
        if (own.length === 0) return [];
        const costs = [...new Set(own.map((tile) => tile.item.cost))].sort(
          (a, b) => a - b,
        );
        const icon = categoryIcon(value);
        return (
          <section key={value} className={`shop-column ${value}`}>
            <h2>
              {icon && <img src={icon} alt="" />}
              {label}
            </h2>
            {costs.map((cost) => (
              <div key={cost}>
                <h3 className="cost-heading">{cost.toLocaleString("en-US")}</h3>
                <div className="item-tiles">
                  {own
                    .filter((tile) => tile.item.cost === cost)
                    .map((tile) => (
                      <Tile key={tile.item.id} tile={tile} badge={false} />
                    ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
