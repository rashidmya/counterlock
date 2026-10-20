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
        title="Deadlock hero tier list | Counterlock"
        description="Deadlock hero tier list: every hero ranked by win rate and pick rate, filterable by role and rank."
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
