import { useLinks } from "@/app/links";
import { HeroesPage } from "@/features/heroes/components/HeroesPage";
import { PageMeta } from "../seo";
import { useRankQuery } from "../RankQuery";

export default function HeroesRoute() {
  const { navigate } = useLinks();
  const [query, setQuery] = useRankQuery();
  return (
    <>
      <PageMeta
        title="Deadlock heroes | Counterlock"
        description="Every Deadlock hero with role and win rate. Open a hero for builds, counters and matchups."
        path="/heroes"
      />
      <HeroesPage
        route={{ page: "heroes" }}
        navigate={navigate}
        query={query}
        setQuery={setQuery}
        catalogWhileLoading
      />
    </>
  );
}
