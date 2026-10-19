import type { Item } from "@/shared/catalog/types";
import { categoryIcon } from "@/shared/ui/gameIcons";
import { ItemIcon } from "@/shared/ui/ItemIcon";

export interface ItemEntry {
  item: Item;
  value?: string;
  note: string;
}

export function ItemList({
  entries,
  onOpen,
}: {
  entries: ItemEntry[];
  onOpen(itemId: number): void;
}) {
  return (
    <div className="item-tiles">
      {entries.map(({ item, value, note }) => {
        const icon = categoryIcon(item.category);
        return (
          <button
            key={item.id}
            className="item-tile"
            title={`${item.name} · ${item.cost.toLocaleString()} souls\n${item.description}`}
            onClick={() => onOpen(item.id)}
          >
            <span className="item-tile-art">
              <ItemIcon item={item} />
              {icon && <img className="item-category" src={icon} alt="" />}
            </span>
            <strong>{item.name}</strong>
            {value && <b>{value}</b>}
            <small>{note}</small>
          </button>
        );
      })}
    </div>
  );
}
