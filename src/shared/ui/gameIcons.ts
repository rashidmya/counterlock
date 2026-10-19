import { catalog } from "@/shared/catalog";

const icons = "https://assets-bucket.deadlock-api.com/assets-api-res/icons/";

export const gameIcons = {
  souls: `${icons}hud/icons/icon_souls.svg`,
  kill: `${icons}post_game/attributes/icon_kill.svg`,
  death: `${icons}hud/icons/skull.svg`,
  weapon: `${icons}shop/keystat_courage.png`,
  vitality: `${icons}shop/keystat_fortitude.png`,
  spirit: `${icons}shop/keystat_spirit.png`,
  early: `${icons}icons/icon_time_early.svg`,
  mid: `${icons}icons/icon_time_mid.svg`,
  late: `${icons}icons/icon_time_late.svg`,
  objective: `${icons}post_game/attributes/icon_objdmg.svg`,
} as const;

const categoryKeys: Record<string, keyof typeof gameIcons> = {
  weapon: "weapon",
  vitality: "vitality",
  spirit: "spirit",
};

export const categoryIcon = (category: string): string | undefined => {
  const key = categoryKeys[category.toLowerCase()];
  return key ? gameIcons[key] : undefined;
};

export const rankImage = (tier: number, subrank: number): string =>
  subrank === 0
    ? (catalog.ranks.find((rank) => rank.tier === tier)?.image ??
      `https://api.deadlock-api.com/v1/assets/ranks/${tier}/0/image?format=webp`)
    : `https://api.deadlock-api.com/v1/assets/ranks/${tier}/${subrank}/image?format=webp`;
