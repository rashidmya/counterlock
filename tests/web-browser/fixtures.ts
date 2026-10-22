import type { Page } from "@playwright/test";
import catalog from "../../src/shared/catalog/catalog.json" with { type: "json" };

export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
export const cors = { "access-control-allow-origin": "*" };

export const FARGO = 400239835;

export const heroStats = catalog.heroes.map((hero, index) => {
  const matches = 20000;
  const wins = matches * (0.4 + index * 0.005);
  return {
    hero_id: hero.id,
    wins,
    losses: matches - wins,
    matches,
    total_kills: 8 * matches,
    total_deaths: 5 * matches,
    total_assists: 10 * matches,
  };
});

export const itemRow = (itemId: number, rate: number) => ({
  item_id: itemId,
  wins: 10000 * rate,
  losses: 10000 * (1 - rate),
  matches: 10000,
});

export const historyRow = (matchId: number, won: boolean) => ({
  account_id: FARGO,
  match_id: matchId,
  hero_id: catalog.heroes[0].id,
  hero_level: 20,
  start_time: Math.floor(Date.now() / 1000) - 3600,
  game_mode: 1,
  match_mode: 4,
  player_team: 0,
  player_kills: 10,
  player_deaths: 5,
  player_assists: 7,
  denies: 3,
  last_hits: 120,
  net_worth: 30000,
  match_duration_s: 1800,
  match_result: won ? 0 : 1,
});

export const shopItems = catalog.items
  .filter((entry) => entry.image && entry.cost > 0)
  .slice(0, 12);
const HAZE = catalog.heroes.find((hero) => hero.name === "Haze")!;

// Main build: eight early items, four mid, none late. Items without
// components, so no upgrade rule drops one.
const phaseItems = catalog.items
  .filter((entry) => entry.image && entry.cost > 0 && !entry.components?.length)
  .slice(12, 24);
const phaseRow = (itemId: number, i: number) => ({
  ...itemRow(itemId, 0.55),
  avg_buy_time_s: 100 + i * 10,
});
const phaseRows: Record<string, unknown[]> = {
  "0": phaseItems.slice(0, 8).map((entry, i) => phaseRow(entry.id, i)),
  "600": phaseItems.slice(8, 12).map((entry, i) => phaseRow(entry.id, i)),
  "1200": [],
};
// Haze vs any enemy: the first shop item gains 10 points net of the matchup.
const versusRows = [
  itemRow(shopItems[0].id, 0.7),
  ...shopItems.slice(1, 6).map((entry) => itemRow(entry.id, 0.58)),
];
const popularBuild = {
  hero_build: {
    hero_id: HAZE.id,
    hero_build_id: 900,
    author_account_id: FARGO,
    last_updated_timestamp: 1_791_000_000,
    name: "Web Fixture Build",
    details: {
      mod_categories: [
        {
          name: "#Citadel_HeroBuilds_EarlyGame",
          mods: shopItems.slice(0, 3).map((entry) => ({
            ability_id: entry.id,
          })),
        },
        {
          name: "Late",
          mods: shopItems.slice(3, 6).map((entry) => ({
            ability_id: entry.id,
          })),
        },
      ],
    },
  },
  num_favorites: 12,
};
const player = (teamHero: number, id: number, team: number) => ({
  account_id: id,
  team,
  hero_id: teamHero,
  kills: 7,
  deaths: 3,
  assists: 9,
  net_worth: 28000,
  last_hits: 140,
  denies: 4,
  level: 22,
  items: shopItems.map((entry, index) => ({
    item_id: entry.id,
    game_time_s: index * 60,
    sold_time_s: 0,
  })),
});

export async function mockApi(page: Page) {
  await page.route("https://assets-bucket.deadlock-api.com/**", (route) =>
    route.fulfill({ body: PNG, contentType: "image/png", headers: cors }),
  );
  await page.route("https://api.deadlock-api.com/**", (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ json: body, headers: cors });
    const path = url.pathname;
    if (path.startsWith("/v1/assets/"))
      return route.fulfill({
        body: PNG,
        contentType: "image/png",
        headers: cors,
      });
    switch (path) {
      case "/v1/analytics/hero-stats":
        return json(heroStats);
      case "/v1/analytics/item-stats": {
        const params = url.searchParams;
        const phase = params.get("min_bought_at_s");
        if (phase !== null) return json(phaseRows[phase] ?? []);
        if (params.has("hero_id") && params.has("enemy_hero_ids"))
          return json(versusRows);
        return json(
          params.has("hero_id")
            ? shopItems.slice(0, 6).map((entry) => itemRow(entry.id, 0.58))
            : shopItems.map((entry) => itemRow(entry.id, 0.5)),
        );
      }
      case "/v1/builds":
        return json([popularBuild]);
      case "/v1/analytics/hero-counter-stats":
        return json(
          catalog.heroes.map((hero, index) => ({
            hero_id: HAZE.id,
            enemy_hero_id: hero.id,
            wins: 500 + index * 20,
            matches_played: 1000,
          })),
        );
      case "/v1/analytics/hero-synergy-stats":
        return json(
          catalog.heroes.map((hero, index) => ({
            hero_id1: HAZE.id,
            hero_id2: hero.id,
            wins: 500 + index * 20,
            matches_played: 1000,
          })),
        );
      case "/v1/players/steam":
        return json([
          {
            account_id: FARGO,
            personaname: "A Rather Long Persona Name Fixture",
            avatarmedium: "https://api.deadlock-api.com/v1/assets/avatar.png",
          },
        ]);
      case "/v1/players/rank":
        return json([{ account_id: FARGO, badge: 53, rank: 5, subrank: 3 }]);
      case "/v1/players/hero-stats":
        return json(
          catalog.heroes.slice(0, 8).map((hero) => ({
            hero_id: hero.id,
            matches_played: 40,
            accuracy: 0.45,
            damage_per_min: 900,
          })),
        );
      case `/v1/players/${FARGO}/match-history`:
        return json(
          catalog.heroes.slice(0, 8).map((hero, index) => ({
            ...historyRow(1001 + index, index % 2 === 0),
            hero_id: hero.id,
          })),
        );
      case "/v1/matches/1001/metadata":
        return json({
          match_info: {
            match_id: 1001,
            duration_s: 1800,
            winning_team: 0,
            players: [
              ...Array.from({ length: 6 }, (_, i) =>
                player(catalog.heroes[i].id, i === 0 ? FARGO : 5000 + i, 0),
              ),
              ...Array.from({ length: 6 }, (_, i) =>
                player(catalog.heroes[i + 6].id, 6000 + i, 1),
              ),
            ],
          },
        });
      default:
        return json([]);
    }
  });
}
