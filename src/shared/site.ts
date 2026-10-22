// The public website's address. Both builds read VITE_SITE_URL, so links the
// desktop app copies point at the same site.
export const SITE_URL: string = (
  import.meta.env.VITE_SITE_URL?.trim() || "https://counterlock.example"
).replace(/\/+$/, "");

export const matchPath = (matchId: number, accountId?: number) =>
  `/matches/${matchId}${accountId ? `?player=${accountId}` : ""}`;

export const matchUrl = (matchId: number, accountId?: number) =>
  `${SITE_URL}${matchPath(matchId, accountId)}`;
