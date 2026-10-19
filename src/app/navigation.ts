export type Page = "home" | "live" | "heroes" | "items" | "lookup";
export interface Route {
  page: Page;
  heroId?: number;
  itemId?: number;
}
export type Navigate = (route: Route) => void;
