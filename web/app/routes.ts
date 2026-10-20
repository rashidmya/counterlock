import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("players/:accountId", "routes/player.tsx"),
  route("heroes", "routes/heroes.tsx"),
  route("heroes/:slug", "routes/hero.tsx"),
  route("items", "routes/items.tsx"),
  route("items/:slug", "routes/item.tsx"),
  route("about", "routes/about.tsx"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
