import { RouteLink } from "@/app/links";
import { RankBadge } from "@/features/profile/components/ProfileHeader";
import {
  fetchMatchHistory,
  fetchSteamProfiles,
} from "@/features/profile/services/profile-api";
import type { HistoryMatch } from "@/features/profile/types";
import { duration, timeAgo } from "@/features/profile/utils/format";
import { isWin, soulsPerMin } from "@/features/profile/utils/match-history";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
import { OptionalImage } from "@/shared/ui/OptionalImage";
import { Picture } from "@/shared/ui/Picture";
import { formLabel, recentForm } from "../utils/recent-form";

function LatestMatch({
  accountId,
  match,
}: {
  accountId: number;
  match: HistoryMatch;
}) {
  const hero = heroById.get(match.heroId);
  const won = isWin(match);
  const souls = Math.round(soulsPerMin(match.netWorth, match.durationS));
  return (
    <div className="latest-match">
      <OptionalImage className="latest-art" src={hero?.backgroundImage} />
      <Picture
        className="latest-portrait"
        src={hero?.cardImage ?? hero?.image}
        label={hero?.name ?? "Hero"}
      />
      <div className="latest-body">
        <p className="eyebrow">
          Latest match · {timeAgo(match.startTime * 1000)}
        </p>
        <p className={`latest-result ${won ? "good" : "bad"}`}>
          {won ? "Victory" : "Defeat"} · {hero?.name ?? "Unknown hero"}
        </p>
        <dl className="latest-stats">
          <div>
            <dt>K / D / A</dt>
            <dd>
              {match.kills} / {match.deaths} / {match.assists}
            </dd>
          </div>
          <div>
            <dt>Souls / min</dt>
            <dd>{souls.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{duration(match.durationS)}</dd>
          </div>
        </dl>
        <div className="latest-links">
          <RouteLink
            className="latest-link"
            route={{ page: "match", matchId: match.matchId, accountId }}
          >
            Open match report →
          </RouteLink>
          <RouteLink
            className="latest-link"
            route={{ page: "profile", accountId }}
          >
            View profile →
          </RouteLink>
        </div>
      </div>
    </div>
  );
}

export function YouCard({ accountId }: { accountId: number }) {
  const profiles = useAsync(() => fetchSteamProfiles([accountId]), [accountId]);
  const history = useAsync(() => fetchMatchHistory(accountId), [accountId]);
  const profile = profiles.data?.find((p) => p.accountId === accountId);
  const name = profile?.name ?? `Player ${accountId}`;
  const form = history.data && recentForm(history.data);
  const latest = history.data?.[0];
  return (
    <div className="home-you-grid">
      <div className="you-card">
        <Picture className="you-avatar" src={profile?.avatar} label={name} />
        <div className="you-body">
          <p className="you-name">{name}</p>
          <RankBadge accountId={accountId} />
          {form && form.results.length > 0 && (
            <>
              <div className="wl-strip" aria-hidden="true">
                {form.results.map((won, index) => (
                  <span key={index} className={won ? "w" : "l"} />
                ))}
              </div>
              <p className="you-form">{formLabel(form)}</p>
            </>
          )}
        </div>
      </div>
      {latest ? (
        <LatestMatch accountId={accountId} match={latest} />
      ) : (
        (history.error || (history.data && !history.loading)) && (
          <p className="muted you-note">
            {history.error
              ? "Match history unavailable."
              : "No recorded matches."}
          </p>
        )
      )}
      {latest && (
        <p className="you-derived">
          Recent form counts normal & ranked games only. Souls / min is the
          match's net worth divided by its minutes.
        </p>
      )}
    </div>
  );
}
