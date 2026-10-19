import { catalog } from "@/shared/catalog";
import { rankFilterOptions } from "../utils/analytics";

const options = rankFilterOptions(catalog.ranks);

export function RankFilter({
  value,
  onChange,
}: {
  value: number;
  onChange(minBadge: number): void;
}) {
  return (
    <label className="select-field">
      Rank
      <select
        aria-label="Rank"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
