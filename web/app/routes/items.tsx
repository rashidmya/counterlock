import { useLinks } from "@/app/links";
import { ItemsPage } from "@/features/items/components/ItemsPage";
import { PageMeta } from "../seo";
import { useRankQuery } from "../RankQuery";

export default function ItemsRoute() {
  const { navigate } = useLinks();
  const [query, setQuery] = useRankQuery();
  return (
    <>
      <PageMeta
        title="Deadlock items | Counterlock"
        description="Every Deadlock item by category and cost, with win rate and pick rate by rank."
        path="/items"
      />
      <ItemsPage
        route={{ page: "items" }}
        navigate={navigate}
        query={query}
        setQuery={setQuery}
      />
    </>
  );
}
