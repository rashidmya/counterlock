import { useAsync } from "@/shared/api/useAsync";
import { Picture } from "@/shared/ui/Picture";
import { fetchSteamProfiles } from "../services/profile-api";
import type { ProfileAccount } from "../types";
import { timeAgo } from "../utils/format";

export function ProfileHeader({
  account,
  onChange,
}: {
  account: ProfileAccount;
  onChange(): void;
}) {
  const { data } = useAsync(
    () => fetchSteamProfiles([account.accountId]),
    [account.accountId],
  );
  const profile = data?.find((p) => p.accountId === account.accountId);
  const name = profile?.name ?? `Player ${account.accountId}`;
  return (
    <div className="profile-header">
      <Picture className="profile-avatar" src={profile?.avatar} label={name} />
      <div className="profile-identity">
        <h1>{name}</h1>
        <small>
          {account.source === "manual"
            ? "Entered manually"
            : `Seen on this PC · ${timeAgo(account.seenAt)}`}
        </small>
      </div>
      <button className="text-button" onClick={onChange}>
        Change
      </button>
    </div>
  );
}
