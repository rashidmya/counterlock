export type Page =
  "home" | "live" | "tierlist" | "heroes" | "items" | "profile";
export interface Route {
  page: Page;
  heroId?: number;
  itemId?: number;
  accountId?: number;
}
export type Navigate = (route: Route) => void;
