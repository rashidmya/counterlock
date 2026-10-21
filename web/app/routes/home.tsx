import { HomeView } from "@/features/home/components/HomeView";
import {
  readRemembered,
  useRememberedMe,
  writeRemembered,
} from "../remembered";
import { PageMeta } from "../seo";

const remember = (accountId: number) => {
  if (readRemembered() === null) writeRemembered(accountId);
};

export default function HomeRoute() {
  const me = useRememberedMe();
  return (
    <>
      <PageMeta
        title="Counterlock — Deadlock stats, builds & counters"
        description="Deadlock hero tier list, item stats, best builds and counters, plus match history for any Steam account."
        path="/"
      />
      <HomeView me={me} onPick={remember} />
    </>
  );
}
