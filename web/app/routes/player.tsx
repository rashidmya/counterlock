import { Link, useParams } from "react-router";
import { useLinks } from "@/app/links";
import { accountId as parseAccountId } from "@/features/match/utils/game";
import { ProfilePage } from "@/features/profile/components/ProfilePage";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { useAsync } from "@/shared/api/useAsync";
import { useRememberedMe } from "../remembered";
import { PageMeta } from "../seo";
import { playerPath } from "../paths";

function Player({ id }: { id: number }) {
  const { navigate } = useLinks();
  const me = useRememberedMe();
  const profile = useAsync(() => fetchSteamProfiles([id]), [id]);
  const name = profile.data?.find((p) => p.accountId === id)?.name;
  return (
    <>
      <PageMeta
        title={`${name ?? `Player ${id}`} | Counterlock`}
        description={`Deadlock profile for ${name ?? `player ${id}`}: rank, match history, heroes and performance.`}
        path={playerPath(id)}
      />
      <ProfilePage key={id} accountId={id} me={me} navigate={navigate} />
    </>
  );
}

export default function PlayerRoute() {
  const { accountId = "" } = useParams();
  const id = /^\d+$/.test(accountId) ? parseAccountId(accountId) : null;
  if (id === null)
    return (
      <section className="web-not-found">
        <title>Invalid player | Counterlock</title>
        <h1>That isn&apos;t a valid player ID.</h1>
        <Link to="/">Back to Counterlock</Link>
      </section>
    );
  return <Player id={id} />;
}
