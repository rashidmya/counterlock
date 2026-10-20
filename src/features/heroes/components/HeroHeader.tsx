import { RouteLink } from "@/app/links";
import type { Hero } from "@/shared/catalog/types";
import { Picture } from "@/shared/ui/Picture";
import type { HeroSummary } from "../utils/analytics";

const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function identity(hero: Hero) {
  const role = hero.role?.toUpperCase();
  const tags = [
    ...new Set(
      hero.tags
        .filter((tag) => tag.toLowerCase() !== hero.role)
        .map((tag) => tag.toUpperCase()),
    ),
  ];
  return { role, tags: tags.join(" / ") };
}

export function HeroHeader({
  hero,
  summary,
  total,
}: {
  hero: Hero;
  summary?: HeroSummary;
  total: number;
}) {
  const { role, tags } = identity(hero);
  const art = hero.backgroundImage
    ? {
        background: `linear-gradient(90deg,#0f151bf2 35%,#0f151b99 70%,#0f151bcc), url("${hero.backgroundImage}") center/cover`,
      }
    : undefined;
  const stat = (value: string | undefined) => value ?? "—";
  return (
    <div className="hero-header" style={art}>
      <div className="hero-frame">
        {summary && (
          <div className={`tier-banner banner-${summary.tier}`}>
            <small>TIER</small>
            <b>{summary.tier}</b>
          </div>
        )}
        <Picture
          src={hero.cardImage ?? hero.image}
          label={hero.name}
          className="hero-card-art"
        />
        {summary && (
          <span className="hero-rank">
            #{summary.position} OF {total}
          </span>
        )}
      </div>
      <div className="hero-header-body">
        <RouteLink className="hero-back" route={{ page: "heroes" }}>
          ← All heroes
        </RouteLink>
        <div className="hero-identity">
          {role && <span className="hero-role">{role}</span>}
          {role && tags && <span className="hero-rule" aria-hidden="true" />}
          {tags && <span className="hero-tags">{tags}</span>}
        </div>
        <h1>{hero.name}</h1>
        {hero.tagline && <p className="hero-tagline">{hero.tagline}</p>}
        <div className="hero-stats">
          <div>
            <strong className="win">
              {stat(summary && percent(summary.winRate))}
            </strong>
            WIN RATE
          </div>
          <div>
            <strong>{stat(summary && percent(summary.pickRate))}</strong>
            PICK RATE
          </div>
          <div>
            <strong>{stat(summary && compact.format(summary.matches))}</strong>
            MATCHES
          </div>
          <div>
            <strong>{stat(summary && summary.kda.toFixed(1))}</strong>
            AVG KDA
          </div>
        </div>
      </div>
    </div>
  );
}
