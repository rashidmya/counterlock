import { HomeView } from "@/features/home/components/HomeView";
import { useRememberedMe } from "../remembered";
import { PageMeta } from "../seo";

export default function HomeRoute() {
  const me = useRememberedMe();
  return (
    <>
      <PageMeta
        title="Counterlock — Deadlock stats, builds & counters"
        description="Deadlock hero tier list, item stats, best builds and counters, plus match history for any Steam account."
        path="/"
      />
      <HomeView me={me} />
    </>
  );
}
