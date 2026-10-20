import { useEffect, useState } from "react";
import { accountId } from "@/features/match/utils/game";
import {
  searchSteamAccounts,
  type SteamProfile,
} from "@/features/profile/services/profile-api";

const MIN_QUERY = 2;
const PROFILE_URL = /steamcommunity\.com\/profiles\/(\d+)/i;

interface Settled {
  query: string;
  results: SteamProfile[];
  error?: string;
}

function directAccountId(text: string): number | null {
  const trimmed = text.trim();
  return accountId(trimmed) ?? accountId(PROFILE_URL.exec(trimmed)?.[1]);
}

export function useSteamSearch(text: string, delayMs = 300) {
  const query = text.trim();
  const active = query.length >= MIN_QUERY;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!active) return;
    let stale = false;
    const timer = setTimeout(() => {
      searchSteamAccounts(query).then(
        (results) => {
          if (!stale) setSettled({ query, results });
        },
        (error: unknown) => {
          if (!stale)
            setSettled({
              query,
              results: [],
              error: error instanceof Error ? error.message : String(error),
            });
        },
      );
    }, delayMs);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, active, delayMs]);

  const current = active && settled?.query === query ? settled : null;
  return {
    results: current?.results ?? [],
    loading: active && !current,
    error: current?.error,
    directId: directAccountId(text),
  };
}
