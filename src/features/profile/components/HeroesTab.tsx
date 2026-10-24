import { RetryButton } from "@/shared/ui/RetryButton";
import { RouteLink } from "@/app/links";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { type SortDir, sortRows } from "@/shared/utils/sort";
import { fetchPlayerHeroStats } from "../services/profile-api";
import type { HeroRow, HistoryFilter, HistoryMatch } from "../types";
import { timeAgo } from "../utils/format";
import { heroBreakdown, matchesFilter } from "../utils/match-history";
import { HistoryFilterButtons } from "./HistoryFilterButtons";

interface Line extends HeroRow {
  name: string;
  damagePerMin: number | null;
  accuracy: number | null;
}

const NONE = "—";
const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;
const whole = (value: number) => Math.round(value).toLocaleString("en-US");
const orNone = <T,>(value: T | null, format: (value: T) => string) =>
  value === null ? NONE : format(value);

export interface HeroSort {
  // The column, by its label: KDA and K/D/A both sort by `kda`.
  label: string;
  key: keyof Line;
  dir: SortDir;
}
export const FIRST_SORT: HeroSort = {
  label: "Games",
  key: "games",
  dir: "desc",
};

interface Column {
  key: keyof Line;
  label: string;
  firstDir?: SortDir;
}

const columns: Column[] = [
  { key: "name", label: "Hero", firstDir: "asc" },
  { key: "games", label: "Games" },
  { key: "wins", label: "W–L" },
  { key: "winRate", label: "WR" },
  { key: "kda", label: "KDA" },
  { key: "kda", label: "K/D/A" },
  { key: "soulsPerMin", label: "Souls/min" },
  { key: "damagePerMin", label: "Dmg/min" },
  { key: "accuracy", label: "Accuracy" },
  { key: "lastHits", label: "Last hits" },
  { key: "denies", label: "Denies" },
  { key: "lastPlayed", label: "Last played" },
];

export function HeroesTab({
  accountId,
  history,
  filter,
  onFilter,
  sort,
  onSort,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
  filter: HistoryFilter;
  onFilter(filter: HistoryFilter): void;
  sort: HeroSort;
  onSort(sort: HeroSort): void;
}) {
  const stats = useAsync(
    () => fetchPlayerHeroStats(accountId, filter),
    [accountId, filter],
  );
  const matches = history.data;
  const lines: Line[] = heroBreakdown(
    (matches ?? []).filter((m) => matchesFilter(m, filter)),
  ).map((row) => {
    const stat = stats.data?.find((s) => s.heroId === row.heroId);
    return {
      ...row,
      name: heroById.get(row.heroId)?.name ?? `Hero ${row.heroId}`,
      damagePerMin: stat?.damagePerMin ?? null,
      accuracy: stat?.accuracy ?? null,
    };
  });
  const sorted = sortRows(lines, sort.key, sort.dir);
  const toggle = ({ label, key, firstDir = "desc" }: Column) =>
    onSort(
      sort.label === label
        ? { label, key, dir: sort.dir === "desc" ? "asc" : "desc" }
        : { label, key, dir: firstDir },
    );
  return (
    <div className="heroes-tab">
      <SectionHeader title="Heroes played" />
      <div className="section-head">
        <HistoryFilterButtons value={filter} onChange={onFilter} />
      </div>
      {history.loading && <p className="muted">Loading match history…</p>}
      {history.error && (
        <p className="notice warning" role="status">
          Match history unavailable
          <RetryButton
            onRetry={history.retry}
            focusTarget='.subtabs [aria-selected="true"]'
          />
        </p>
      )}
      {matches && !lines.length && <p className="muted">No recorded matches</p>}
      {!!lines.length && (
        <>
          <div className="hero-table-wrap">
            <table className="hero-table">
              <thead>
                <tr>
                  {columns.map((column) => {
                    const active = sort.label === column.label;
                    return (
                      <th
                        key={column.label}
                        aria-sort={
                          active
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                        className={active ? "sorted" : ""}
                      >
                        <button onClick={() => toggle(column)}>
                          {column.label}
                          {active && (
                            <span aria-hidden="true">
                              {sort.dir === "asc" ? " ▴" : " ▾"}
                            </span>
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((line) => (
                  <tr key={line.heroId} className="hero-row">
                    <td>
                      <RouteLink
                        className="hero-link"
                        route={{ page: "heroes", heroId: line.heroId }}
                      >
                        <Picture
                          className="hero-portrait"
                          src={heroById.get(line.heroId)?.image}
                          label={line.name}
                        />
                        {line.name}
                      </RouteLink>
                    </td>
                    <td>{line.games}</td>
                    <td>
                      {line.wins}–{line.losses}
                    </td>
                    <td className={line.winRate >= 0.5 ? "win" : "loss"}>
                      {percent(line.winRate)}
                    </td>
                    <td>{line.kda.toFixed(1)}</td>
                    <td>
                      {line.kills.toFixed(1)}/{line.deaths.toFixed(1)}/
                      {line.assists.toFixed(1)}
                    </td>
                    <td>{whole(line.soulsPerMin)}</td>
                    <td>{orNone(line.damagePerMin, whole)}</td>
                    <td>{orNone(line.accuracy, percent)}</td>
                    <td>{line.lastHits.toFixed(1)}</td>
                    <td>{line.denies.toFixed(1)}</td>
                    <td>{timeAgo(line.lastPlayed * 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="data-note">
            K/D/A, last hits and denies are per-game averages. Damage and
            accuracy come from hero stats and show — when unavailable.
          </p>
        </>
      )}
    </div>
  );
}
