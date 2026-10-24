import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { RouteLink } from "@/app/links";
import {
  STREET_BRAWL_MODE,
  TEAM_NAMES,
  type Team,
} from "@/features/match-report/utils/report";
import { useAsync, type AsyncState } from "@/shared/api/useAsync";
import { catalog, heroById } from "@/shared/catalog";
import { rankImage } from "@/shared/ui/gameIcons";
import { Picture } from "@/shared/ui/Picture";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { useFocusOnRemoval } from "@/shared/ui/useFocusOnRemoval";
import type { LiveState } from "../hooks/useLiveMatch";
import { fetchRankBadges, fetchSteamProfiles } from "../services/profile-api";
import {
  elapsedS,
  soulLead,
  standing,
  type LiveMatch,
} from "../utils/live-match";
import { modeLabel } from "../utils/match-history";

const TEAMS: Team[] = [0, 1];
const PATRON = {
  standing: "Standing",
  weakened: "Weakened",
  destroyed: "Destroyed",
};
const souls = (value: number) => value.toLocaleString("en-US");

/** The Live tab when there's no match to show, and why. */
export function LiveEmpty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="live-empty-tab">
      <h2>{title}</h2>
      <p className="muted">{children}</p>
    </div>
  );
}

function LiveTeam({
  match,
  team,
  accountId,
  names,
  ranks,
  status,
}: {
  match: LiveMatch;
  team: Team;
  accountId: number;
  names: Map<number, string>;
  ranks?: Map<number, number>;
  status: RefObject<HTMLElement | null>;
}) {
  const mask = match.teams[team].objectives;
  // Street Brawl has no lanes to push: its masks never change.
  const left =
    mask === null || match.gameMode === STREET_BRAWL_MODE
      ? null
      : standing(mask);
  return (
    <section className={`live-team team-${team}`}>
      <h3>{TEAM_NAMES[team]}</h3>
      <ul className="live-players">
        {match.players
          .filter((p) => p.team === team)
          .map((p, index) => {
            const hero = p.heroId === null ? undefined : heroById.get(p.heroId);
            const heroName =
              hero?.name ??
              (p.heroId === null ? "Hero unknown" : `Hero ${p.heroId}`);
            const name = names.get(p.accountId) ?? `Player ${p.accountId}`;
            const current = p.accountId === accountId;
            const badge = ranks?.get(p.accountId);
            const tier = badge ? Math.floor(badge / 10) : 0;
            const subrank = badge ? badge % 10 : 0;
            const rankName = catalog.ranks.find(
              (rank) => rank.tier === tier,
            )?.name;
            return (
              <LivePlayerRow
                key={
                  p.accountId > 0 ? p.accountId : `unknown-${p.heroId}-${index}`
                }
                className={current ? "current" : undefined}
                current={current}
                status={status}
              >
                <Picture
                  className="hero-portrait"
                  src={hero?.image}
                  label={heroName}
                />
                <span>
                  <b>{heroName}</b>
                  {/* An account of 0 has no profile, nor a name. */}
                  {current ? (
                    <span className="live-name">{name}</span>
                  ) : (
                    p.accountId > 0 && (
                      <RouteLink
                        className="live-name"
                        route={{ page: "profile", accountId: p.accountId }}
                      >
                        {name}
                      </RouteLink>
                    )
                  )}
                  {p.accountId > 0 && (
                    <span
                      className="live-player-rank"
                      title={
                        rankName ? "Current rank" : "Current rank not supplied"
                      }
                    >
                      {rankName && badge ? (
                        <>
                          <Picture
                            className="profile-rank-badge small"
                            src={rankImage(tier, subrank)}
                            label={rankName}
                          />
                          {rankName}
                          {subrank ? ` ${subrank}` : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </span>
                  )}
                </span>
              </LivePlayerRow>
            );
          })}
      </ul>
      {match.gameMode !== STREET_BRAWL_MODE && (
        <>
          <h4>Objectives standing</h4>
          <dl className="live-objectives">
            <div>
              <dt>Guardians</dt>
              <dd>{left ? `${left.guardians} / 3` : "—"}</dd>
            </div>
            <div>
              <dt>Walkers</dt>
              <dd>{left ? `${left.walkers} / 3` : "—"}</dd>
            </div>
            <div>
              <dt>Base Guardians</dt>
              <dd>{left ? `${left.baseGuardians} / 3` : "—"}</dd>
            </div>
            <div>
              <dt>Shrines</dt>
              <dd>{left ? `${left.shrines} / 2` : "—"}</dd>
            </div>
            <div>
              <dt>Patron</dt>
              <dd>{left ? PATRON[left.patron] : "—"}</dd>
            </div>
          </dl>
          {!left && (
            <p className="data-note">
              Objectives unavailable: the Watch list did not supply them.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function LivePlayerRow({
  children,
  current,
  className,
  status,
}: {
  children: ReactNode;
  current: boolean;
  className?: string;
  status: RefObject<HTMLElement | null>;
}) {
  const row = useRef<HTMLLIElement>(null);
  useFocusOnRemoval(row, status);
  return (
    <li
      ref={row}
      className={className}
      aria-current={current ? "true" : undefined}
    >
      {children}
    </li>
  );
}

function SoulsLead({
  amber,
  sapphire,
}: {
  amber: number | null;
  sapphire: number | null;
}) {
  if (amber === null || sapphire === null)
    return (
      <>
        <strong>—</strong>
        <em>not given</em>
      </>
    );
  const lead = soulLead(amber, sapphire);
  return (
    <>
      <strong className={lead ? `team-${lead.team}` : undefined}>
        {lead ? `${TEAM_NAMES[lead.team]} +${souls(lead.souls)}` : "Even"}
      </strong>
      <em>
        Amber {souls(amber)} – {souls(sapphire)} Sapphire
      </em>
    </>
  );
}

function LiveMatchView({
  match,
  accountId,
  status,
  onAnnouncement,
}: {
  match: LiveMatch;
  accountId: number;
  status: RefObject<HTMLElement | null>;
  onAnnouncement(message: string): void;
}) {
  // The players' links are the only things in the teams that take focus.
  const teams = useRef<HTMLDivElement>(null);
  useFocusOnRemoval(teams, status);
  const ids = [
    ...new Set(match.players.map((p) => p.accountId).filter((id) => id > 0)),
  ].sort((a, b) => a - b);
  const profiles = useAsync(
    (signal) => fetchSteamProfiles(ids, undefined, signal),
    [ids.join(",")],
  );
  const ranks = useAsync(
    (signal) => fetchRankBadges(ids, undefined, signal),
    [ids.join(",")],
  );
  const retryNames = useDetailStatus(
    profiles,
    "Player names",
    "Loading player names…",
    onAnnouncement,
  );
  const retryRanks = useDetailStatus(
    ranks,
    "Current ranks",
    "Loading current ranks…",
    onAnnouncement,
  );
  const names = new Map(profiles.data?.map((p) => [p.accountId, p.name]));
  const [amber, sapphire] = TEAMS.map((team) => match.teams[team]);
  return (
    <>
      <SectionHeader title="Live match" />
      <p className="data-note live-match-meta">
        Region: {match.region ?? "—"} · Spectators: {match.spectators ?? "—"}
      </p>
      {profiles.error && (
        <LiveNotice
          className="live-names-notice"
          status={status}
          onRetry={() => {
            status.current?.focus({ preventScroll: true });
            retryNames();
          }}
        >
          Player names unavailable: {profiles.error}
        </LiveNotice>
      )}
      {ranks.error && (
        <LiveNotice
          className="live-ranks-notice"
          status={status}
          onRetry={() => {
            status.current?.focus({ preventScroll: true });
            retryRanks();
          }}
        >
          Current ranks unavailable: {ranks.error}
        </LiveNotice>
      )}
      <div className="stat-row live-stats">
        <div className="stat-card">
          <small>Match time</small>
          <strong>{Math.floor(elapsedS(match, Date.now()) / 60)} min</strong>
          <em>since it started</em>
        </div>
        {match.gameMode === STREET_BRAWL_MODE ? (
          <div className="stat-card">
            <small>Rounds won</small>
            <strong>
              {amber.rounds ?? "—"} – {sapphire.rounds ?? "—"}
            </strong>
            <em>Amber – Sapphire</em>
          </div>
        ) : (
          <div className="stat-card">
            <small>Souls lead</small>
            <SoulsLead amber={amber.netWorth} sapphire={sapphire.netWorth} />
          </div>
        )}
        <div className="stat-card">
          <small>Mode</small>
          <strong>{modeLabel(match)}</strong>
          <em>Match {match.matchId}</em>
        </div>
      </div>
      <div className="live-teams" ref={teams}>
        {TEAMS.map((team) => (
          <LiveTeam
            key={team}
            {...{ match, team, accountId, names, status }}
            ranks={ranks.data}
          />
        ))}
      </div>
      <p className="data-note">
        From the game&apos;s Watch list, through Deadlock API, checked again
        every minute while this profile is open. The API&apos;s copy of the list
        can be a few minutes old.
      </p>
    </>
  );
}

/** Initial failures and each retry update an already mounted live region. */
function useDetailStatus<T>(
  request: AsyncState<T>,
  label: string,
  loading: string,
  announce: (message: string) => void,
) {
  const hadFailure = useRef(false);
  useEffect(() => {
    if (request.loading) {
      if (hadFailure.current) announce(loading);
    } else if (request.error) {
      hadFailure.current = true;
      announce(`${label} unavailable: ${request.error}`);
    } else if (hadFailure.current) {
      hadFailure.current = false;
      announce(`${label} loaded.`);
    }
  }, [request.loading, request.error, label, loading, announce]);
  return () => {
    hadFailure.current = true;
    announce(loading);
    request.retry();
  };
}

/** A notice with Retry. */
function LiveNotice({
  className = "live-watch-notice",
  status,
  onRetry,
  children,
  busy = false,
}: {
  className?: string;
  status: RefObject<HTMLElement | null>;
  onRetry(): void;
  children: ReactNode;
  busy?: boolean;
}) {
  const notice = useRef<HTMLParagraphElement>(null);
  useFocusOnRemoval(notice, status);
  return (
    <p
      className={`notice warning ${className}`}
      ref={notice}
      aria-busy={busy || undefined}
    >
      {children}
      <button type="button" onClick={onRetry} disabled={busy}>
        Retry
      </button>
    </p>
  );
}

export function LiveTab({
  accountId,
  live,
}: {
  accountId: number;
  live: LiveState;
}) {
  const [focused, setFocused] = useState(false);
  const [detailsAnnouncement, setDetailsAnnouncement] = useState("");
  useEffect(() => setDetailsAnnouncement(""), [live.match?.matchId]);
  // A newer Watch-list result owns the shared announcement. Otherwise a
  // previous names/ranks retry can mask a later failure to check the match.
  useEffect(() => {
    if (live.announcement) setDetailsAnnouncement("");
  }, [live.announcement]);
  // Retry goes with its notice as soon as it's pressed: focus moves to the
  // status, which says what is being checked, rather than falling to the
  // page. Here, not in LiveNotice's cleanup: not every browser focuses a
  // clicked button.
  const status = useRef<HTMLParagraphElement>(null);
  // React suppresses focus events during its commit, including focus
  // handed here by a removed child's layout cleanup.
  useLayoutEffect(() => {
    setFocused(document.activeElement === status.current);
  });
  const retry = () => {
    setDetailsAnnouncement("");
    status.current?.focus({ preventScroll: true });
    live.retry();
  };
  return (
    <div className="live-tab">
      <p
        className="live-status"
        role="status"
        aria-atomic="true"
        ref={status}
        tabIndex={-1}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {detailsAnnouncement ||
          live.announcement ||
          (focused
            ? live.match
              ? "Live match found."
              : live.match === null
                ? "No live match found."
                : "Looking for a live match…"
            : "")}
      </p>
      {live.error && (
        <LiveNotice status={status} onRetry={retry} busy={live.loading}>
          {live.match === undefined
            ? `Live matches unavailable: ${live.error}`
            : `Couldn't check again: ${live.error}`}
        </LiveNotice>
      )}
      {live.match === null && (
        <LiveEmpty title="No live match found">
          Live matches show here only while the game&apos;s Watch list has them:
          about the top 200 matches being played. This tab checks again every
          minute.
          {live.lastMatchId && (
            <span className="last-live-match">
              <RouteLink
                route={{ page: "match", matchId: live.lastMatchId, accountId }}
              >
                Open last match report
              </RouteLink>
              <span>
                The report becomes available once Deadlock API has stored the
                match.
              </span>
            </span>
          )}
        </LiveEmpty>
      )}
      {live.match && (
        <LiveMatchView
          // Another match has its own names and ranks; return focus if
          // a check removes the match being read.
          key={live.match.matchId}
          match={live.match}
          accountId={accountId}
          status={status}
          onAnnouncement={setDetailsAnnouncement}
        />
      )}
    </div>
  );
}
