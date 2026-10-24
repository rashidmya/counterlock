import { useMemo, useState } from "react";
import { LinkScope } from "@/app/links";
import type { Navigate, Route } from "@/app/navigation";
import { useAsync } from "@/shared/api/useAsync";
import { catalog, itemById } from "@/shared/catalog";
import { PageTitle } from "@/shared/ui/PageTitle";
import { RetryButton } from "@/shared/ui/RetryButton";
import { sortRows } from "@/shared/utils/sort";
import { RankFilter } from "@/features/heroes/components/RankFilter";
import {
  fetchHeroSummaries,
  fetchItemStats,
} from "@/features/heroes/services/hero-analytics";
import {
  itemTable,
  type AnalyticsQuery,
} from "@/features/heroes/utils/analytics";
import { ItemDetail } from "./ItemDetail";
import { ItemShopGrid, type ShopTile } from "./ItemShopGrid";

type CategoryFilter = "all" | "weapon" | "vitality" | "spirit";
type SortMode = "cost" | "winRate" | "pickRate";

const categories: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "weapon", label: "Weapon" },
  { value: "vitality", label: "Vitality" },
  { value: "spirit", label: "Spirit" },
];
const sorts: { value: SortMode; label: string }[] = [
  { value: "cost", label: "Cost" },
  { value: "winRate", label: "Win rate" },
  { value: "pickRate", label: "Pick rate" },
];

const percent = (rate: number | null) =>
  rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;

export function ItemsPage({
  route,
  navigate,
  query,
  setQuery,
}: {
  route: Route;
  navigate: Navigate;
  query: AnalyticsQuery;
  setQuery(query: AnalyticsQuery): void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<SortMode>("cost");
  const stats = useAsync(() => fetchItemStats(query), [query.minBadge]);
  const heroes = useAsync(() => fetchHeroSummaries(query), [query.minBadge]);
  const table = useMemo(
    () =>
      itemTable(
        stats.data ?? [],
        (heroes.data ?? []).reduce((sum, hero) => sum + hero.matches, 0),
      ),
    [stats.data, heroes.data],
  );
  if (route.itemId !== undefined)
    return (
      <LinkScope navigate={navigate}>
        <ItemDetail
          key={route.itemId}
          item={itemById.get(route.itemId)}
          perf={table.get(route.itemId)}
          loading={stats.loading || heroes.loading}
        />
      </LinkScope>
    );

  const needle = search.trim().toLowerCase();
  const rows = catalog.items
    .filter(
      (item) =>
        (category === "all" || item.category === category) &&
        item.name.toLowerCase().includes(needle),
    )
    .map((item) => ({
      item,
      name: item.name,
      winRate: table.get(item.id)?.winRate ?? null,
      pickRate: table.get(item.id)?.pickRate ?? null,
    }));
  const ordered =
    sort === "cost"
      ? sortRows(rows, "name", "asc")
      : sortRows(rows, sort, "desc");
  const tiles: ShopTile[] = ordered.map((row) => ({
    item: row.item,
    note: sort === "cost" ? undefined : percent(row[sort]),
  }));
  const failed = stats.error ?? heroes.error;
  return (
    <LinkScope navigate={navigate}>
      <section className="items-page">
        <PageTitle title="The Shop" ribbon="Every item · win & pick rates" />
        <div className="items-toolbar">
          <input
            type="search"
            aria-label="Search items"
            placeholder="Search items"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="filter-buttons" role="group" aria-label="Category">
            {categories.map((option) => (
              <button
                key={option.value}
                className={category === option.value ? "active" : ""}
                aria-pressed={category === option.value}
                onClick={() => setCategory(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="items-selects">
            <label className="select-field">
              Sort
              <select
                aria-label="Sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
              >
                {sorts.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <RankFilter
              value={query.minBadge}
              onChange={(minBadge) => setQuery({ ...query, minBadge })}
            />
          </div>
        </div>
        {(stats.loading || heroes.loading) && (
          <p className="muted">Loading item stats…</p>
        )}
        {failed && (
          <p className="notice warning" role="status">
            Item stats unavailable: {failed}
            <RetryButton
              onRetry={() => {
                if (stats.error) stats.retry();
                if (heroes.error) heroes.retry();
              }}
            />
          </p>
        )}
        {tiles.length === 0 ? (
          <p className="muted">No items match.</p>
        ) : (
          <ItemShopGrid
            tiles={tiles}
            layout={sort === "cost" ? "shop" : "flat"}
          />
        )}
        {stats.data && (
          <p className="data-note">
            Expensive items show higher win rates partly because players who are
            ahead can afford them.
          </p>
        )}
      </section>
    </LinkScope>
  );
}
