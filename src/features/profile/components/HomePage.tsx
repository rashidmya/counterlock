import type { Navigate } from "@/app/navigation";
import { useProfileAccount } from "../hooks/useProfileAccount";
import { ProfileEmpty } from "./ProfileEmpty";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileView } from "./ProfileView";

export function HomePage({ navigate }: { navigate: Navigate }) {
  const { account, setManual, clear } = useProfileAccount();
  if (!account) return <ProfileEmpty onSubmit={setManual} />;
  return (
    <ProfileView
      accountId={account.accountId}
      header={<ProfileHeader account={account} onChange={clear} />}
      navigate={navigate}
    />
  );
}
