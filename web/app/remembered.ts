export const REMEMBERED_KEY = "counterlock.web.account";

// Passed as navigation state so "Find another player" is not bounced back to
// the remembered account.
export const BROWSE_STATE = { browse: true } as const;

const storage = (): Storage | undefined =>
  typeof window === "undefined" ? undefined : window.localStorage;

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
  } catch {
    // Storage may be blocked; the account just isn't remembered.
  }
}

export function clearRemembered(): void {
  try {
    storage()?.removeItem(REMEMBERED_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
