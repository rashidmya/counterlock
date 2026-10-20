import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useLinks } from "@/app/links";
import { accountId as parseAccountId } from "@/features/match/utils/game";
import { ProfileHeader } from "@/features/profile/components/ProfileHeader";
import { ProfileView } from "@/features/profile/components/ProfileView";
import { fetchSteamProfiles } from "@/features/profile/services/profile-api";
import { useAsync } from "@/shared/api/useAsync";
import {
  BROWSE_STATE,
  clearRemembered,
  readRemembered,
  writeRemembered,
} from "../remembered";
import { PageMeta } from "../seo";
import { playerPath } from "../paths";

function Player({ id }: { id: number }) {
  const { navigate } = useLinks();
  const router = useNavigate();
  const [remembered, setRemembered] = useState<number | null>(null);
  useEffect(() => setRemembered(readRemembered()), [id]);
  const profile = useAsync(() => fetchSteamProfiles([id]), [id]);
  const name = profile.data?.find((p) => p.accountId === id)?.name;
  const isMe = remembered === id;
  return (
    <>
      <PageMeta
        title={`${name ?? `Player ${id}`} | Counterlock`}
        description={`Deadlock profile for ${name ?? `player ${id}`}: rank, match history, heroes and performance.`}
        path={playerPath(id)}
      />
      <ProfileView
        accountId={id}
        navigate={navigate}
        header={
          <>
            <ProfileHeader
              account={{ accountId: id, seenAt: Date.now(), source: "manual" }}
              subtitle="Deadlock profile"
              actionLabel={
                isMe ? "Not you? Switch account" : "Find another player"
              }
              onChange={() => {
                if (isMe) clearRemembered();
                router("/", { state: BROWSE_STATE });
              }}
            />
            {remembered !== id && (
              <button
                type="button"
                className="text-button web-this-is-me"
                onClick={() => {
                  writeRemembered(id);
                  setRemembered(id);
                }}
              >
                This is me
              </button>
            )}
          </>
        }
      />
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
