import { useCallback, useEffect, useState } from "react";
import {
  clearProfileAccount,
  readProfileAccount,
  subscribeProfileAccount,
  writeProfileAccount,
} from "../storage";
import type { ProfileAccount } from "../types";

export function useProfileAccount() {
  const [account, setAccount] = useState<ProfileAccount | null>(
    readProfileAccount,
  );
  useEffect(() => {
    setAccount(readProfileAccount());
    return subscribeProfileAccount(() => setAccount(readProfileAccount()));
  }, []);
  const setManual = useCallback((accountId: number) => {
    const next: ProfileAccount = {
      accountId,
      seenAt: Date.now(),
      source: "manual",
    };
    writeProfileAccount(next);
    setAccount(next);
  }, []);
  const clear = useCallback(() => {
    clearProfileAccount();
    setAccount(null);
  }, []);
  return { account, setManual, clear };
}
