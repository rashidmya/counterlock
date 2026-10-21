import { RouteLink } from "@/app/links";
import { heroById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import type { Tier } from "../utils/analytics";

export interface HeroCard {
  heroId: number;
  name: string;
  image?: string;
  winRate: number | null;
  pickRate: number | null;
  tier?: Tier;
}

const percent = (rate: number | null) =>
  rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;

export function HeroGrid({
  cards,
  variant = "tier",
}: {
  cards: HeroCard[];
  variant?: "tier" | "roster";
}) {
  return (
    <div className="hero-grid">
      {cards.map((card) => {
        const hero = heroById.get(card.heroId);
        return (
          <RouteLink
            key={card.heroId}
            className="hero-card"
            route={{ page: "heroes", heroId: card.heroId }}
          >
            {hero?.backgroundImage && (
              <img className="hero-card-bg" src={hero.backgroundImage} alt="" />
            )}
            <Picture
              className="hero-portrait hero-card-portrait"
              src={hero?.cardImage ?? hero?.image ?? card.image}
              label={card.name}
            />
            {variant === "tier" && card.tier && (
              <span className={`tier-letter tier-${card.tier}`}>
                {card.tier}
              </span>
            )}
            <span className="hero-card-text">
              <span className="hero-name">{card.name}</span>
              {variant === "roster" ? (
                <small className="hero-card-stat">
                  {`${hero?.role ?? "—"} · `}
                  <b className="win">{percent(card.winRate)}</b>
                  {" win"}
                </small>
              ) : (
                <small className="hero-card-stat">
                  <b className="win">{percent(card.winRate)}</b>
                  {` win · ${percent(card.pickRate)} pick`}
                </small>
              )}
            </span>
          </RouteLink>
        );
      })}
    </div>
  );
}
