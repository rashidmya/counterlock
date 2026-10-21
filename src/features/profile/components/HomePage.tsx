import type { Navigate } from "@/app/navigation";
import { accountSubtitle, type useDesktopMe } from "../me";
import { ProfileEmpty } from "./ProfileEmpty";
import { ProfilePage } from "./ProfilePage";

export function HomePage({
  navigate,
  me,
}: {
  navigate: Navigate;
  me: ReturnType<typeof useDesktopMe>;
}) {
  const { account } = me;
  if (!account) return <ProfileEmpty onSubmit={me.setMe} />;
  return (
    <ProfilePage
      key={account.accountId}
      accountId={account.accountId}
      me={me}
      navigate={navigate}
      subtitle={accountSubtitle(account)}
    />
  );
}
