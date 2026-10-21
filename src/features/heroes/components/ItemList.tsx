import { RouteLink } from "@/app/links";
import type { Item } from "@/shared/catalog/types";
import { ItemIcon } from "@/shared/ui/ItemIcon";

export interface ItemEntry {
  item: Item;
  value?: string;
  note: string;
}

export function ItemList({ entries }: { entries: ItemEntry[] }) {
  return (
    <div className="item-tiles">
      {entries.map(({ item, value, note }) => (
        <RouteLink
          key={item.id}
          className={`item-tile ${item.category}`}
          route={{ page: "items", itemId: item.id }}
          title={`${item.name} · ${item.cost.toLocaleString()} souls\n${item.description}`}
        >
          <span className="item-tile-art">
            <ItemIcon item={item} />
          </span>
          <strong>{item.name}</strong>
          {value && <b>{value}</b>}
          <small>{note}</small>
        </RouteLink>
      ))}
    </div>
  );
}
