export type Page =
  "home" | "live" | "tierlist" | "heroes" | "items" | "profile" | "match";
export interface Route {
  page: Page;
  heroId?: number;
  itemId?: number;
  // Profile: whose profile. Match: the player the viewer came from.
  accountId?: number;
  matchId?: number;
}
export type Navigate = (route: Route) => void;
