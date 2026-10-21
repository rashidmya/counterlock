import { RouteLink } from "@/app/links";
import { HeroGrid } from "@/features/heroes/components/HeroGrid";
import { fetchHeroSummaries } from "@/features/heroes/services/hero-analytics";
import { PlayerSearch } from "@/features/player-search/components/PlayerSearch";
import type { MeAdapter } from "@/features/profile/me";
import { useAsync } from "@/shared/api/useAsync";
import { catalog } from "@/shared/catalog";
import { OptionalImage } from "@/shared/ui/OptionalImage";
import { PageTitle } from "@/shared/ui/PageTitle";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { topHeroCards } from "../utils/top-heroes";
import { YouCard } from "./YouCard";

const artHero = catalog.heroes.find((hero) => hero.name === "Haze");

const fetchTopCards = async () =>
  topHeroCards(await fetchHeroSummaries({ minBadge: 0 }));

export function HomeView({ me }: { me: MeAdapter }) {
  const top = useAsync(fetchTopCards, []);
  const { meId } = me;
  return (
    <section className="home">
      <div className="home-hero">
        <div className="home-art" aria-hidden="true">
          <OptionalImage src={artHero?.backgroundImage} />
        </div>
        <PageTitle
          eyebrow="Deadlock stats & builds"
          title="Know the match."
          ribbon="Make your move"
        />
        <PlayerSearch label="Find a player" />
      </div>

      <section className="home-you">
        <SectionHeader
          title="You"
          action={
            meId !== null && (
              <RouteLink route={{ page: "profile", accountId: meId }}>
                My profile →
              </RouteLink>
            )
          }
        />
        {meId !== null ? (
          <>
            <YouCard key={meId} accountId={meId} />
            <button type="button" className="home-switch" onClick={me.clearMe}>
              Not you? Switch account
            </button>
          </>
        ) : (
          <p className="muted">
            Search for your Steam account above, open it and press This is me.
          </p>
        )}
      </section>

      <section className="home-top">
        <SectionHeader
          title="Top of the city"
          action={
            <RouteLink route={{ page: "tierlist" }}>Tier list →</RouteLink>
          }
        />
        {top.loading && <p className="muted">Loading…</p>}
        {top.error && (
          <p className="muted">Hero stats are unavailable right now.</p>
        )}
        {top.data &&
          (top.data.length ? (
            <HeroGrid cards={top.data} variant="tier" />
          ) : (
            <p className="muted">Hero stats are unavailable right now.</p>
          ))}
      </section>
    </section>
  );
}
