import { useParams } from "react-router";
import { useLinks } from "@/app/links";
import { ItemsPage } from "@/features/items/components/ItemsPage";
import { itemIdBySlug } from "@/shared/catalog/slugs";
import { PageMeta, itemMetaInput } from "../seo";
import { useRankQuery } from "../RankQuery";
import { NotFound } from "../NotFound";

export default function ItemRoute() {
  const { slug = "" } = useParams();
  const { navigate } = useLinks();
  const [query, setQuery] = useRankQuery();
  const itemId = itemIdBySlug(slug);
  if (itemId === undefined)
    return (
      <NotFound
        title="Item not found"
        message="We don't have an item with that name."
        back={{ to: "/items", label: "All items" }}
      />
    );
  return (
    <>
      <PageMeta {...itemMetaInput(itemId)} />
      <ItemsPage
        route={{ page: "items", itemId }}
        navigate={navigate}
        query={query}
        setQuery={setQuery}
      />
    </>
  );
}
