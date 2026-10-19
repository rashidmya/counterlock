import type { HistoryFilter } from "../types";

const filters: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "normal", label: "Normal" },
  { value: "ranked", label: "Ranked" },
  { value: "street_brawl", label: "Street Brawl" },
];

export function HistoryFilterButtons({
  value,
  onChange,
}: {
  value: HistoryFilter;
  onChange(filter: HistoryFilter): void;
}) {
  return (
    <div className="filter-buttons" role="group" aria-label="Game mode">
      {filters.map((filter) => (
        <button
          key={filter.value}
          className={value === filter.value ? "active" : ""}
          aria-pressed={value === filter.value}
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
