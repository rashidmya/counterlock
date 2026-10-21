import type { HeroCard } from "@/features/heroes/components/HeroGrid";
import type { HeroSummary } from "@/features/heroes/utils/analytics";
import { heroById } from "@/shared/catalog";

const COUNT = 6;

export function topHeroCards(summaries: HeroSummary[]): HeroCard[] {
  return [...summaries]
    .sort((a, b) => a.position - b.position)
    .flatMap((summary) => {
      const hero = heroById.get(summary.heroId);
      return hero
        ? [
            {
              heroId: hero.id,
              name: hero.name,
              image: hero.image,
              winRate: summary.winRate,
              pickRate: summary.pickRate,
              tier: summary.tier,
            },
          ]
        : [];
    })
    .slice(0, COUNT);
}
