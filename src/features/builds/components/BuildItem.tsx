import { RouteLink } from "@/app/links";
import { itemById } from "@/shared/catalog";
import { ItemIcon } from "@/shared/ui/ItemIcon";

// One build tile. The art is hidden from screen readers so the visible name
// (and sub-line) is the tile's accessible name; the title adds the cost and
// the author's note.
export function BuildItem({
  itemId,
  sub,
  note,
  owned,
}: {
  itemId: number;
  sub?: string;
  note?: string;
  owned?: boolean;
}) {
  const item = itemById.get(itemId);
  if (!item)
    return (
      <span className="build-item unknown" title={`Unknown item #${itemId}`}>
        <strong>Item #{itemId}</strong>
      </span>
    );
  const classes = [
    "build-item",
    item.category,
    owned && "owned",
    note && "has-note",
  ].filter(Boolean);
  return (
    <RouteLink
      className={classes.join(" ")}
      route={{ page: "items", itemId }}
      title={`${item.name} · ${item.cost.toLocaleString()} souls${note ? `\n${note}` : ""}`}
    >
      <span className="build-art" aria-hidden="true">
        <ItemIcon item={item} />
        {owned && <span className="owned-mark">✓</span>}
      </span>
      <strong>{item.name}</strong>
      {sub && <small>{sub}</small>}
    </RouteLink>
  );
}
