import type { Route } from "@/app/navigation";
import { heroSlug, itemSlug } from "@/shared/catalog/slugs";

export function routeToPath(route: Route): string {
  if (route.page === "heroes")
    return route.heroId === undefined
      ? "/heroes"
      : `/heroes/${heroSlug(route.heroId)}`;
  if (route.page === "items")
    return route.itemId === undefined
      ? "/items"
      : `/items/${itemSlug(route.itemId)}`;
  return "/";
}

export const playerPath = (accountId: number) => `/players/${accountId}`;
