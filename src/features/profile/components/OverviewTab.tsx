import { RouteLink } from "@/app/links";
import type { AsyncState } from "@/shared/api/useAsync";
import { useAsync } from "@/shared/api/useAsync";
import { catalog, heroById } from "@/shared/catalog";
import { gameIcons, rankImage } from "@/shared/ui/gameIcons";
import { Picture } from "@/shared/ui/Picture";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import {
  fetchMates,
  fetchRank,
  fetchSteamProfiles,
} from "../services/profile-api";
import type { HistoryMatch } from "../types";
import {
  isSummaryMatch,
  rankedSummary,
  summarize,
  topHeroes,
} from "../utils/match-history";
import { MatchHistory } from "./MatchHistory";

const percent = (rate: number | null, digits = 0) =>
  rate === null ? "—" : `${(rate * 100).toFixed(digits)}%`;

function RankCard({ accountId }: { accountId: number }) {
  const { data: rank, loading } = useAsync(
    () => fetchRank(accountId),
    [accountId],
  );
  const unranked = rank?.rank === 0 || rank?.badge === 0;
  const name = rank && catalog.ranks.find((r) => r.tier === rank.rank)?.name;
  return (
    <div className="stat-card rank-card">
      <small>RANK</small>
      {rank && unranked ? (
        <div className="rank-value">
          <strong>Unranked</strong>
        </div>
      ) : rank && name ? (
        <div className="rank-value">
          <Picture
            className="profile-rank-badge"
            src={rankImage(rank.rank, rank.subrank)}
            label={name}
          />
          <strong>{rank.subrank ? `${name} ${rank.subrank}` : name}</strong>
        </div>
      ) : (
        <strong className="unavailable">{loading ? "…" : "Unavailable"}</strong>
      )}
      <em>From the latest recorded ranked match</em>
    </div>
  );
}

function Teammates({ accountId }: { accountId: number }) {
  const { data } = useAsync(async () => {
    const mates = await fetchMates(accountId);
    const profiles = await fetchSteamProfiles(mates.map((m) => m.accountId));
    return mates.map((mate) => ({
      ...mate,
      profile: profiles.find((p) => p.accountId === mate.accountId),
    }));
  }, [accountId]);
  if (!data?.length) return null;
  return (
    <section>
      <SectionHeader title="Frequent teammates" />
      <ul className="teammates">
        {data.map((mate) => {
          const name = mate.profile?.name ?? `Player ${mate.accountId}`;
          return (
            <li key={mate.accountId} className="teammate">
              <Picture
                className="profile-avatar small"
                src={mate.profile?.avatar}
                label={name}
              />
              <strong>{name}</strong>
              <span className="muted">
                {mate.games} games · {percent(mate.wins / mate.games)} WR
                together
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function OverviewTab({
  accountId,
  history,
  onShowAll,
}: {
  accountId: number;
  history: AsyncState<HistoryMatch[]>;
  onShowAll(): void;
}) {
  const matches = history.data;
  const summaryMatches = matches?.filter(isSummaryMatch) ?? [];
  const summary = summarize(summaryMatches);
  const ranked = rankedSummary(matches ?? []);
  const heroes = topHeroes(summaryMatches);
  return (
    <div className="overview">
      <div className="stat-row">
        <RankCard accountId={accountId} />
        {matches?.length ? (
          <>
            <div className="stat-card">
              <small>RANKED</small>
              <strong>{ranked.games}</strong>
              <em>
                {ranked.winRate === null
                  ? "No ranked games"
                  : `${percent(ranked.winRate, 1)} WR`}
              </em>
            </div>
            <div className="stat-card">
              <small>AVG KDA</small>
              <strong>{summary.games ? summary.kda.toFixed(1) : "—"}</strong>
            </div>
            <div className="stat-card">
              <small>SOULS/MIN</small>
              <strong className="with-icon">
                <img src={gameIcons.souls} alt="" />
                {summary.games
                  ? Math.round(summary.soulsPerMin).toLocaleString("en-US")
                  : "—"}
              </strong>
            </div>
          </>
        ) : null}
      </div>
      {matches?.length ? (
        <p className="data-note">Normal & ranked games</p>
      ) : null}
      {history.loading && <p className="muted">Loading match history…</p>}
      {history.error && (
        <p className="notice warning" role="status">
          Match history unavailable
          <button type="button" onClick={history.retry}>
            Retry
          </button>
        </p>
      )}
      {matches && !matches.length && (
        <p className="muted">No recorded matches</p>
      )}
      {!!heroes.length && (
        <section>
          <SectionHeader title="Top heroes" />
          <div className="top-heroes">
            {heroes.map((row) => {
              const hero = heroById.get(row.heroId);
              const name = hero?.name ?? `Hero ${row.heroId}`;
              return (
                <RouteLink
                  key={row.heroId}
                  className="top-hero"
                  route={{ page: "heroes", heroId: row.heroId }}
                >
                  <Picture
                    className="hero-portrait large"
                    src={hero?.image}
                    label={name}
                  />
                  <strong>{name}</strong>
                  <span>
                    <b className={row.winRate >= 0.5 ? "win" : "loss"}>
                      {percent(row.winRate)}
                    </b>{" "}
                    · {row.games} games
                  </span>
                </RouteLink>
              );
            })}
          </div>
        </section>
      )}
      <Teammates accountId={accountId} />
      {!!matches?.length && (
        <MatchHistory preview {...{ matches, accountId, onShowAll }} />
      )}
    </div>
  );
}
