import { useProfileAccount } from "./hooks/useProfileAccount";
import type { ProfileAccount } from "./types";
import { timeAgo } from "./utils/format";

export interface MeAdapter {
  meId: number | null;
  setMe(accountId: number): void;
  clearMe(): void;
}

export function useDesktopMe(): MeAdapter & { account: ProfileAccount | null } {
  const { account, setManual, clear } = useProfileAccount();
  return {
    account,
    meId: account?.accountId ?? null,
    setMe: setManual,
    clearMe: clear,
  };
}

export const accountSubtitle = (account: ProfileAccount) =>
  account.source === "manual"
    ? "Entered manually"
    : `Seen on this PC · ${timeAgo(account.seenAt)}`;
