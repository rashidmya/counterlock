import type { Item } from "@/shared/catalog/types";
import { ItemIcon } from "./ItemIcon";

export function OverlayItem({
  item,
  owned = false,
  detail = "",
  targets = [],
}: {
  item: Item;
  owned?: boolean;
  detail?: string;
  targets?: string[];
}) {
  return (
    <div
      className={`hud-item ${owned ? "owned" : ""}`}
      title={`${item.name} · ${item.cost.toLocaleString()} souls${owned ? " · Owned" : ""}\n${targets.length ? `Against ${targets.join(", ")}\n` : ""}${detail || item.description}`}
    >
      <ItemIcon item={item} />
      <span>{item.name}</span>
      {targets.length > 0 && (
        <small className="hud-targets">{targets.join(", ")}</small>
      )}
      {owned && <b>✓</b>}
    </div>
  );
}
