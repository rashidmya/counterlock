import type { MatchState } from "@/features/match/types";
import type { ProfileAccount } from "./types";

export const PROFILE_KEY = "counterlock.profile.account";
const REFRESH_AFTER_MS = 5 * 60_000;

export function readProfileAccount(): ProfileAccount | null {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      Number.isSafeInteger(value.accountId) &&
      value.accountId > 0 &&
      Number.isFinite(value.seenAt) &&
      (value.source === "detected" || value.source === "manual")
    )
      return {
        accountId: value.accountId,
        seenAt: value.seenAt,
        source: value.source,
      };
  } catch {
    /* Treat unreadable storage as no account. */
  }
  return null;
}

export function writeProfileAccount(account: ProfileAccount) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(account));
  } catch {
    /* Session-only if storage is unavailable. */
  }
}

export function clearProfileAccount() {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* Nothing to clear if storage is unavailable. */
  }
}

export function recordDetectedAccount(state: MatchState, now = Date.now()) {
  const id =
    state.localAccountId ??
    state.players.find((p) => p.local)?.accountId ??
    null;
  if (!id) return;
  const stored = readProfileAccount();
  if (
    stored &&
    stored.accountId === id &&
    stored.source === "detected" &&
    now - stored.seenAt <= REFRESH_AFTER_MS
  )
    return;
  writeProfileAccount({ accountId: id, seenAt: now, source: "detected" });
}

/** The callback may fire for this window's own writes; it should just re-read. */
export function subscribeProfileAccount(callback: () => void) {
  const listener = (event: StorageEvent) => {
    if (event.key === PROFILE_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
