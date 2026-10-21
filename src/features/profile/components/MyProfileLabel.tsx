import { useAsync } from "@/shared/api/useAsync";
import { Picture } from "@/shared/ui/Picture";
import { fetchSteamProfiles } from "../services/profile-api";

export function MyProfileLabel({ meId }: { meId: number | null }) {
  if (meId === null) return <>Find your account</>;
  return <MyName accountId={meId} />;
}

function MyName({ accountId }: { accountId: number }) {
  const { data } = useAsync(() => fetchSteamProfiles([accountId]), [accountId]);
  const profile = data?.find((p) => p.accountId === accountId);
  const name = profile?.name ?? `Player ${accountId}`;
  return (
    <>
      <Picture className="my-avatar" src={profile?.avatar} label={name} />
      <span className="my-name">{name}</span>
    </>
  );
}
