import { createContext, useContext, useMemo, useState } from "react";
import type { AnalyticsQuery } from "@/features/heroes/utils/analytics";

type RankQuery = [AnalyticsQuery, (query: AnalyticsQuery) => void];

const RankQueryContext = createContext<RankQuery | undefined>(undefined);

export function RankQueryProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState<AnalyticsQuery>({ minBadge: 0 });
  const value = useMemo<RankQuery>(() => [query, setQuery], [query]);
  return (
    <RankQueryContext.Provider value={value}>
      {children}
    </RankQueryContext.Provider>
  );
}

export function useRankQuery(): RankQuery {
  const value = useContext(RankQueryContext);
  if (!value) throw new Error("useRankQuery needs a RankQueryProvider");
  return value;
}
