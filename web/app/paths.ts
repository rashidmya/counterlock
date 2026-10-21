import type { Route } from "@/app/navigation";
import { heroSlug, itemSlug } from "@/shared/catalog/slugs";

export function routeToPath(route: Route): string {
  if (route.page === "tierlist") return "/tier-list";
  if (route.page === "profile")
    return route.accountId === undefined ? "/" : playerPath(route.accountId);
  if (route.page === "heroes") {
    const slug =
      route.heroId === undefined ? undefined : heroSlug(route.heroId);
    return slug ? `/heroes/${slug}` : "/heroes";
  }
  if (route.page === "items") {
    const slug =
      route.itemId === undefined ? undefined : itemSlug(route.itemId);
    return slug ? `/items/${slug}` : "/items";
  }
  return "/";
}

export const playerPath = (accountId: number) => `/players/${accountId}`;
