import { useParams } from "react-router";
import { useLinks } from "@/app/links";
import { HeroesPage } from "@/features/heroes/components/HeroesPage";
import { heroIdBySlug } from "@/shared/catalog/slugs";
import { PageMeta, heroMetaInput } from "../seo";
import { useRankQuery } from "../RankQuery";
import { NotFound } from "../NotFound";

export default function HeroRoute() {
  const { slug = "" } = useParams();
  const { navigate } = useLinks();
  const [query, setQuery] = useRankQuery();
  const heroId = heroIdBySlug(slug);
  if (heroId === undefined)
    return (
      <NotFound
        title="Hero not found"
        message="We don't have a hero with that name."
        back={{ to: "/heroes", label: "All heroes" }}
      />
    );
  return (
    <>
      <PageMeta {...heroMetaInput(heroId)} />
      <HeroesPage
        route={{ page: "heroes", heroId }}
        navigate={navigate}
        query={query}
        setQuery={setQuery}
      />
    </>
  );
}
