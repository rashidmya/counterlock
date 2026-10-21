import type { ReactNode } from "react";
import { useAsync } from "@/shared/api/useAsync";
import { catalog, heroById } from "@/shared/catalog";
import { rankImage } from "@/shared/ui/gameIcons";
import { OptionalImage } from "@/shared/ui/OptionalImage";
import { Picture } from "@/shared/ui/Picture";
import { fetchRank, fetchSteamProfiles } from "../services/profile-api";

function RankBadge({ accountId }: { accountId: number }) {
  const { data: rank } = useAsync(() => fetchRank(accountId), [accountId]);
  if (!rank) return null;
  if (rank.rank === 0 || rank.badge === 0)
    return <span className="profile-meta-rank">Unranked</span>;
  const name = catalog.ranks.find((r) => r.tier === rank.rank)?.name;
  if (!name) return null;
  return (
    <span className="profile-meta-rank">
      <Picture
        className="profile-rank-badge small"
        src={rankImage(rank.rank, rank.subrank)}
        label={name}
      />
      {rank.subrank ? `${name} ${rank.subrank}` : name}
    </span>
  );
}

export function ProfileHeader({
  accountId,
  subtitle,
  topHeroId,
  actions,
  back,
}: {
  accountId: number;
  subtitle?: string;
  topHeroId?: number;
  actions: ReactNode;
  back?: ReactNode;
}) {
  const { data } = useAsync(() => fetchSteamProfiles([accountId]), [accountId]);
  const profile = data?.find((p) => p.accountId === accountId);
  const name = profile?.name ?? `Player ${accountId}`;
  const topHero = topHeroId === undefined ? undefined : heroById.get(topHeroId);
  return (
    <div className="profile-header">
      <div className="profile-header-body">
        {back}
        <div className="profile-who">
          <Picture
            className="profile-avatar"
            src={profile?.avatar}
            label={name}
          />
          <div className="profile-identity">
            <p className="eyebrow">Player profile</p>
            <h1>{name}</h1>
            <div className="profile-meta">
              <RankBadge accountId={accountId} />
              {topHero && <span>Most played: {topHero.name}</span>}
              {subtitle && <span>{subtitle}</span>}
            </div>
          </div>
        </div>
        <div className="profile-actions">{actions}</div>
      </div>
      {topHero && (
        <div className="hero-art" key={topHero.id}>
          <OptionalImage
            src={topHero.backgroundImage}
            className="hero-art-bg"
          />
        </div>
      )}
    </div>
  );
}
