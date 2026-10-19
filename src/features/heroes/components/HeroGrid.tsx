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
  onOpen,
}: {
  cards: HeroCard[];
  onOpen(heroId: number): void;
}) {
  return (
    <div className="hero-grid">
      {cards.map((card) => (
        <button
          key={card.heroId}
          className="hero-card"
          onClick={() => onOpen(card.heroId)}
        >
          <Picture
            className="hero-portrait hero-card-portrait"
            src={card.image}
            label={card.name}
          />
          <span className="hero-card-text">
            <span className="hero-name">{card.name}</span>
            <small>
              {percent(card.winRate)} · {percent(card.pickRate)} pick
            </small>
          </span>
          {card.tier && (
            <span className={`tier-letter tier-${card.tier}`}>{card.tier}</span>
          )}
        </button>
      ))}
    </div>
  );
}
