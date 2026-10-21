import { RouteLink } from "@/app/links";
import { catalog, heroById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import { sortRows } from "@/shared/utils/sort";
import type { HeroSummary, Tier } from "../utils/analytics";

export type RoleFilter = "all" | "assassin" | "brawler" | "marksman" | "mystic";

export const roles: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "assassin", label: "Assassin" },
  { value: "brawler", label: "Brawler" },
  { value: "marksman", label: "Marksman" },
  { value: "mystic", label: "Mystic" },
];
const tiers: Tier[] = ["S", "A", "B", "C", "D"];

const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

export function RoleButtons({
  value,
  onChange,
}: {
  value: RoleFilter;
  onChange(role: RoleFilter): void;
}) {
  return (
    <div className="filter-buttons" role="group" aria-label="Role">
      {roles.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "active" : ""}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface Tile {
  heroId: number;
  name: string;
  image?: string;
  winRate: number | null;
  pickRate: number | null;
}

export function TierTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tier-tiles">
      {tiles.map((tile) => {
        const hero = heroById.get(tile.heroId);
        return (
          <RouteLink
            key={tile.heroId}
            className="tier-tile"
            route={{ page: "heroes", heroId: tile.heroId }}
          >
            <Picture
              className="tier-tile-pic"
              src={hero?.cardImage ?? hero?.image ?? tile.image}
              label={tile.name}
            />
            <b className="hero-name">{tile.name}</b>
            <span className="tier-tile-stat">
              {tile.winRate === null || tile.pickRate === null ? (
                "—"
              ) : (
                <>
                  <em className="win">{percent(tile.winRate)}</em>
                  {` · ${percent(tile.pickRate)}`}
                </>
              )}
            </span>
          </RouteLink>
        );
      })}
    </div>
  );
}

export function catalogTiles(): Tile[] {
  return sortRows(
    catalog.heroes.map((hero) => ({
      heroId: hero.id,
      name: hero.name,
      image: hero.image,
      winRate: null,
      pickRate: null,
    })),
    "name",
    "asc",
  );
}

export function TierList({
  summaries,
  role,
  failed = false,
}: {
  summaries: HeroSummary[];
  role: RoleFilter;
  failed?: boolean;
}) {
  const summaryById = new Map(summaries.map((s) => [s.heroId, s]));
  const heroes = catalog.heroes
    .filter((hero) => role === "all" || hero.role === role)
    .map((hero) => {
      const summary = summaryById.get(hero.id);
      return {
        heroId: hero.id,
        name: hero.name,
        image: hero.image,
        winRate: summary?.winRate ?? null,
        pickRate: summary?.pickRate ?? null,
        tier: summary?.tier,
      };
    });
  const rows = [
    ...tiers.map((tier) => ({
      key: tier,
      label: tier,
      className: `tier-${tier}`,
      tiles: sortRows(
        heroes.filter((hero) => hero.tier === tier),
        "winRate",
        "desc",
      ),
    })),
    {
      key: "none",
      label: failed ? "NO DATA" : "UNRANKED",
      className: "tier-none",
      tiles: sortRows(
        heroes.filter((hero) => !hero.tier),
        "name",
        "asc",
      ),
    },
  ].filter((row) => row.tiles.length);
  return (
    <div className="tier-list">
      {rows.map((row) => (
        <div key={row.key} className="tier-row">
          <div className={`tier-label ${row.className}`}>{row.label}</div>
          <TierTiles tiles={row.tiles} />
        </div>
      ))}
    </div>
  );
}
