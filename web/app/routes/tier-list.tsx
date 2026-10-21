import { useLinks } from "@/app/links";
import { TierListPage } from "@/features/heroes/components/TierListPage";
import { PageMeta } from "../seo";

export default function TierListRoute() {
  const { navigate } = useLinks();
  return (
    <>
      <PageMeta
        title="Deadlock hero tier list | Counterlock"
        description="Deadlock hero tier list: every hero ranked by win rate, filterable by role."
        path="/tier-list"
      />
      <TierListPage navigate={navigate} catalogWhileLoading />
    </>
  );
}
