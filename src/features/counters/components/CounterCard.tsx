import type { ReactNode } from "react";
import type { Item } from "@/shared/catalog/types";
import { ItemIcon } from "@/shared/ui/ItemIcon";

export function CounterCard({
  item,
  label,
  targets,
  children,
}: {
  item: Item;
  label: string;
  targets: string[];
  children: ReactNode;
}) {
  return (
    <article className="item-card">
      <div className="item-top">
        <ItemIcon item={item} />
        <div>
          <span className="item-label">{label}</span>
          <h3>{item.name}</h3>
        </div>
        <span className="price">
          {item.cost.toLocaleString()}
          <small>SOULS</small>
        </span>
      </div>
      <p>{children}</p>
      <div className="targets">
        {targets.map((target) => (
          <span key={target}>{target}</span>
        ))}
      </div>
    </article>
  );
}
