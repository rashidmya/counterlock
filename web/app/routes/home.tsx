import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { fetchHeroSummaries } from "@/features/heroes/services/hero-analytics";
import { HeroGrid, type HeroCard } from "@/features/heroes/components/HeroGrid";
import { PlayerSearch } from "@/features/player-search/components/PlayerSearch";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
import { playerPath } from "../paths";
import { readRemembered, writeRemembered } from "../remembered";
import { PageMeta } from "../seo";

async function fetchSTierCards(): Promise<HeroCard[]> {
  const summaries = await fetchHeroSummaries({ minBadge: 0 });
  return summaries
    .filter((summary) => summary.tier === "S")
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
    });
}

export default function HomeRoute() {
  const navigate = useNavigate();
  const browsing = (useLocation().state as { browse?: boolean } | null)?.browse;
  const sTier = useAsync(fetchSTierCards, []);

  useEffect(() => {
    if (browsing) return;
    const remembered = readRemembered();
    if (remembered !== null)
      navigate(playerPath(remembered), { replace: true });
  }, [navigate, browsing]);

  return (
    <>
      <PageMeta
        title="Counterlock — Deadlock stats, builds & counters"
        description="Deadlock hero tier list, item stats, best builds and counters, plus match history for any Steam account."
        path="/"
      />
      <section className="web-home">
        <div className="web-hero">
          <h1>Deadlock stats, builds and counters</h1>
          <p className="muted">
            Counterlock shows which heroes and items are winning right now, the
            best build for every hero, and your own match history.
          </p>
          <PlayerSearch
            label="Find your Steam account"
            onPick={(id) => {
              if (!browsing || readRemembered() === null) writeRemembered(id);
            }}
          />
          <p className="web-home-links">
            <Link to="/heroes">Hero tier list</Link>
            <Link to="/items">Items</Link>
          </p>
        </div>
        <section className="web-s-tier">
          <h2>S-tier heroes right now</h2>
          {sTier.loading && <p className="muted">Loading…</p>}
          {sTier.error && (
            <p className="muted">Hero stats are unavailable right now.</p>
          )}
          {sTier.data &&
            (sTier.data.length ? (
              <HeroGrid cards={sTier.data} />
            ) : (
              <p className="muted">No S-tier heroes at the moment.</p>
            ))}
        </section>
      </section>
    </>
  );
}
