import { RouteLink } from "@/app/links";
import type { Hero } from "@/shared/catalog/types";
import { OptionalImage } from "@/shared/ui/OptionalImage";
import { Picture } from "@/shared/ui/Picture";
import { Ribbon } from "@/shared/ui/PageTitle";
import type { AnalyticsQuery, HeroSummary } from "../utils/analytics";
import { AbilityRow } from "./AbilityRow";
import { RankFilter } from "./RankFilter";

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
  return { role, tags: tags.join(" · ") };
}

export function HeroHeader({
  hero,
  summary,
  query,
  setQuery,
}: {
  hero: Hero;
  summary?: HeroSummary;
  query: AnalyticsQuery;
  setQuery(query: AnalyticsQuery): void;
}) {
  const { role, tags } = identity(hero);
  const stat = (value: string | undefined) => value ?? "—";
  return (
    <div className="hero-header">
      <div className="hero-header-body">
        <RouteLink className="hero-back" route={{ page: "heroes" }}>
          ← All heroes
        </RouteLink>
        <div className="hero-identity">
          {role && <span className="hero-role">{role}</span>}
          {tags && <span className="hero-tags">{tags}</span>}
        </div>
        <div className="hero-title-row">
          {summary && (
            <span className={`hero-tier tier-letter tier-${summary.tier}`}>
              {summary.tier}
            </span>
          )}
          <h1>{hero.name}</h1>
        </div>
        {hero.tagline && (
          <Ribbon className="hero-tagline">{hero.tagline}</Ribbon>
        )}
        <AbilityRow abilityIds={hero.abilityIds ?? []} />
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
          <RankFilter
            value={query.minBadge}
            onChange={(minBadge) => setQuery({ ...query, minBadge })}
          />
        </div>
      </div>
      <div className="hero-art">
        <OptionalImage src={hero.backgroundImage} className="hero-art-bg" />
        <div className="hero-art-pic">
          <Picture src={hero.cardImage ?? hero.image} label={hero.name} />
        </div>
      </div>
    </div>
  );
}
