import type { Navigate } from "@/app/navigation";
import type { Item } from "@/shared/catalog/types";
import {
  buildsFrom,
  buildsInto,
  type ItemPerf,
} from "@/features/heroes/utils/analytics";
import { ItemIcon } from "@/shared/ui/ItemIcon";

const percent = (rate?: number) =>
  rate === undefined ? "—" : `${(rate * 100).toFixed(1)}%`;

function clock(seconds?: number) {
  if (seconds === undefined) return "—";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

function Links({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: Item[];
  onOpen(itemId: number): void;
}) {
  return (
    <section className="item-links">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <span className="muted">—</span>
      ) : (
        <div>
          {items.map((item) => (
            <button
              key={item.id}
              className="item-link"
              onClick={() => onOpen(item.id)}
            >
              <ItemIcon item={item} />
              {item.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function ItemDetail({
  item,
  perf,
  navigate,
}: {
  item?: Item;
  perf?: ItemPerf;
  navigate: Navigate;
}) {
  const back = (
    <button
      type="button"
      className="item-back"
      onClick={() => navigate({ page: "items" })}
    >
      ← All items
    </button>
  );
  if (!item)
    return (
      <div className="item-detail">
        {back}
        <p className="muted">Item not found.</p>
      </div>
    );
  const open = (itemId: number) => navigate({ page: "items", itemId });
  return (
    <div className="item-detail">
      <div className="item-detail-card">
        {back}
        <div className="item-head">
          <ItemIcon item={item} className="item-detail-art" />
          <div>
            <h1>{item.name}</h1>
            <p className="item-meta">
              {capitalize(item.category)} · {item.cost.toLocaleString("en-US")}{" "}
              souls · {item.active ? "Active" : "Passive"}
            </p>
            {item.description && (
              <p className="item-description">{item.description}</p>
            )}
          </div>
        </div>
        {item.stats && item.stats.length > 0 && (
          <ul className="item-stats">
            {item.stats.map((stat, index) => (
              <li key={`${stat.label}:${index}`} className="item-stat">
                {stat.icon && <img src={stat.icon} alt="" />}
                {`${stat.value} ${stat.label}`}
              </li>
            ))}
          </ul>
        )}
        <div className="stat-boxes">
          <div className="stat-box">
            <small>Win rate</small>
            <strong className="win">{percent(perf?.winRate)}</strong>
          </div>
          <div className="stat-box">
            <small>Pick rate</small>
            <strong>{percent(perf?.pickRate)}</strong>
          </div>
          <div className="stat-box">
            <small>Avg buy time</small>
            <strong>{clock(perf?.avgBuyS)}</strong>
          </div>
        </div>
        <p className="data-note">
          Expensive items show higher win rates partly because players who are
          ahead can afford them.
        </p>
        <Links title="Builds from" items={buildsFrom(item)} onOpen={open} />
        <Links title="Builds into" items={buildsInto(item)} onOpen={open} />
      </div>
    </div>
  );
}
