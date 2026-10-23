import { RouteLink } from "@/app/links";
import type { Navigate } from "@/app/navigation";
import { useAsync } from "@/shared/api/useAsync";
import type { MeAdapter } from "../me";
import { fetchMatchHistory } from "../services/profile-api";
import { topHeroes } from "../utils/match-history";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileView } from "./ProfileView";

export function ProfilePage({
  accountId,
  me,
  navigate,
  subtitle = "Deadlock profile",
}: {
  accountId: number;
  me: MeAdapter;
  navigate: Navigate;
  subtitle?: string;
}) {
  const history = useAsync(() => fetchMatchHistory(accountId), [accountId]);
  const topHeroId = history.data && topHeroes(history.data, 1)[0]?.heroId;
  const isMe = me.meId === accountId;
  return (
    // Keyed, so another account never starts from this one's view.
    <ProfileView
      key={accountId}
      accountId={accountId}
      history={history}
      navigate={navigate}
      header={
        <ProfileHeader
          accountId={accountId}
          subtitle={subtitle}
          topHeroId={topHeroId}
          back={
            <RouteLink className="profile-back" route={{ page: "home" }}>
              ← Back
            </RouteLink>
          }
          actions={
            isMe ? (
              <button
                type="button"
                className="profile-action"
                onClick={() => {
                  me.clearMe();
                  navigate({ page: "home" });
                }}
              >
                Not you? Switch account
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="profile-action accent"
                  onClick={() => me.setMe(accountId)}
                >
                  This is me
                </button>
                <button
                  type="button"
                  className="profile-action"
                  onClick={() => navigate({ page: "home" })}
                >
                  Find another player
                </button>
              </>
            )
          }
        />
      }
    />
  );
}
