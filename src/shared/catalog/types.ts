export type HeroRole = "assassin" | "brawler" | "marksman" | "mystic";
export interface Hero {
  id: number;
  name: string;
  image?: string;
  tags: string[];
  role?: HeroRole;
  cardImage?: string;
  backgroundImage?: string;
  tagline?: string;
  abilityIds?: number[];
  popularItems?: {
    timestamp?: number | null;
    early_game: PopularItem[];
    mid_game: PopularItem[];
    late_game: PopularItem[];
  } | null;
}
export interface PopularItem {
  item_id: number;
  pick_pct: number;
  winrate_pct?: number;
}
export interface Ability {
  id: number;
  heroId: number;
  name: string;
  image?: string;
  quip: string;
  description: string;
  // Always length 3; index = tier - 1; "" = no upgrade text for that tier.
  upgrades: string[];
}
export interface ItemStat {
  label: string;
  value: string;
  icon?: string;
}
export interface Item {
  id: number;
  name: string;
  cost: number;
  category: string;
  image?: string;
  localImage?: string;
  description: string;
  className?: string;
  tier?: number;
  active?: boolean;
  components?: string[];
  stats?: ItemStat[];
}
export interface Rank {
  tier: number;
  name: string;
  image?: string;
}
export interface Catalog {
  fetchedAt: string;
  heroes: Hero[];
  abilities: Ability[];
  items: Item[];
  ranks: Rank[];
}
