import { itemById } from "@/shared/catalog";
import { ItemIcon } from "@/shared/ui/ItemIcon";
import { useMeasuredBuild } from "@/features/builds/hooks/useMeasuredBuild";

export function HeroBuild({ heroId }: { heroId: number }) {
  const result = useMeasuredBuild(heroId, "normal", "desktop");
  const data = result?.data;
  if (!data)
    return (
      <p className="build-empty" role="status">
        {result?.error ?? "Loading build and its match statistics…"}
      </p>
    );
  const { stats } = data;
  return (
    <div className="build-panel panel hero-build">
      <p className="hero-build-summary">
        <strong>{data.name}</strong> · #{stats.hero_build_id} ·{" "}
        {((100 * stats.wins) / stats.matches).toFixed(1)}% win rate ·{" "}
        {stats.matches.toLocaleString()} games
      </p>
      <div className="build-stages measured-build-stages">
        {data.groups.map((group, index) => (
          <div className="build-stage" key={index}>
            <h3>{group.name}</h3>
            {group.description && <p className="muted">{group.description}</p>}
            <div className="build-items">
              {group.ids.map((itemId, i) => {
                const item = itemById.get(itemId);
                return item ? (
                  <div
                    key={`${itemId}:${i}`}
                    className="build-item"
                    tabIndex={0}
                    title={`${item.name} · ${item.cost.toLocaleString()} souls\n${item.description}`}
                  >
                    <div className="build-art">
                      <ItemIcon item={item} />
                    </div>
                    <strong>{item.name}</strong>
                    <small>{item.cost.toLocaleString()} souls</small>
                  </div>
                ) : (
                  <div
                    key={`${itemId}:${i}`}
                    className="build-item"
                    title={`Unknown item #${itemId}`}
                  >
                    <strong>Item #{itemId}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="build-source">
        Last 30 days · ranked + unranked · build selected at match start.
        Results span build versions; purchases may differ.{" "}
        <a
          href="https://api.deadlock-api.com/docs"
          target="_blank"
          rel="noreferrer"
        >
          Deadlock API ↗
        </a>
      </p>
    </div>
  );
}
