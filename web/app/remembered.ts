import { useCallback, useEffect, useState } from "react";
import type { MeAdapter } from "@/features/profile/me";

export const REMEMBERED_KEY = "counterlock.web.account";

// Passed as navigation state so "Find another player" is not bounced back to
// the remembered account.
export const BROWSE_STATE = { browse: true } as const;

const REMEMBERED_EVENT = "counterlock:remembered";

const storage = (): Storage | undefined =>
  typeof window === "undefined" ? undefined : window.localStorage;

function notify(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REMEMBERED_EVENT));
}

/** Fires for other tabs (storage events) and for this tab's own writes. */
export function subscribeRemembered(callback: () => void): () => void {
  const onStorage = (event: Event) => {
    const key = (event as StorageEvent).key;
    if (key === REMEMBERED_KEY || key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(REMEMBERED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(REMEMBERED_EVENT, callback);
  };
}

export function readRemembered(): number | null {
  try {
    const raw = storage()?.getItem(REMEMBERED_KEY);
    if (!raw) return null;
    const id = (JSON.parse(raw) as { accountId?: unknown } | null)?.accountId;
    return typeof id === "number" && Number.isSafeInteger(id) && id > 0
      ? id
      : null;
  } catch {
    return null;
  }
}

export function writeRemembered(id: number): void {
  try {
    storage()?.setItem(REMEMBERED_KEY, JSON.stringify({ accountId: id }));
    notify();
  } catch {
    // Storage may be blocked; the account just isn't remembered.
  }
}

export function clearRemembered(): void {
  try {
    storage()?.removeItem(REMEMBERED_KEY);
    notify();
  } catch {
    // Nothing to clear when storage is blocked.
  }
}

/** Starts as `null` and reads storage in an effect so pre-rendered HTML matches hydration. */
export function useRememberedMe(): MeAdapter {
  const [meId, setMeId] = useState<number | null>(null);
  useEffect(() => {
    setMeId(readRemembered());
    return subscribeRemembered(() => setMeId(readRemembered()));
  }, []);
  const setMe = useCallback(
    (accountId: number) => writeRemembered(accountId),
    [],
  );
  const clearMe = useCallback(() => clearRemembered(), []);
  return { meId, setMe, clearMe };
}
