import { RouteLink } from "@/app/links";
import type { Item } from "@/shared/catalog/types";
import {
  buildsFrom,
  buildsInto,
  type ItemPerf,
} from "@/features/heroes/utils/analytics";
import { ItemIcon } from "@/shared/ui/ItemIcon";
import { SectionHeader } from "@/shared/ui/SectionHeader";

const percent = (rate?: number) =>
  rate === undefined ? "—" : `${(rate * 100).toFixed(1)}%`;

function clock(seconds?: number) {
  if (seconds === undefined) return "—";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

function Links({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="item-links">
      <SectionHeader title={title} />
      {items.length === 0 ? (
        <span className="muted">—</span>
      ) : (
        <div>
          {items.map((item) => (
            <RouteLink
              key={item.id}
              className="item-link"
              route={{ page: "items", itemId: item.id }}
            >
              <ItemIcon item={item} />
              {item.name}
            </RouteLink>
          ))}
        </div>
      )}
    </section>
  );
}

export function ItemDetail({
  item,
  perf,
  loading = false,
}: {
  item?: Item;
  perf?: ItemPerf;
  loading?: boolean;
}) {
  const back = (
    <RouteLink className="item-back" route={{ page: "items" }}>
      ← All items
    </RouteLink>
  );
  if (!item)
    return (
      <div className="item-detail">
        {back}
        <p className="muted">Item not found.</p>
      </div>
    );
  const shown = (value: string) => (loading && !perf ? "…" : value);
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
                {stat.icon ? (
                  <img src={stat.icon} alt="" />
                ) : (
                  <span className="item-stat-icon" aria-hidden="true"></span>
                )}
                <b>{stat.value}</b> {stat.label}
              </li>
            ))}
          </ul>
        )}
        <div className="stat-boxes">
          <div className="stat-box">
            <small>Win rate</small>
            <strong className="win">{shown(percent(perf?.winRate))}</strong>
          </div>
          <div className="stat-box">
            <small>Pick rate</small>
            <strong>{shown(percent(perf?.pickRate))}</strong>
          </div>
          <div className="stat-box">
            <small>Avg buy time</small>
            <strong>{shown(clock(perf?.avgBuyS))}</strong>
          </div>
        </div>
        <p className="data-note">
          Expensive items show higher win rates partly because players who are
          ahead can afford them.
        </p>
        <Links title="Builds from" items={buildsFrom(item)} />
        <Links title="Builds into" items={buildsInto(item)} />
      </div>
    </div>
  );
}
