import { useRef, type ReactNode } from "react";
import { RouteLink } from "@/app/links";
import {
  STREET_BRAWL_MODE,
  TEAM_NAMES,
  type Team,
} from "@/features/match-report/utils/report";
import { useAsync } from "@/shared/api/useAsync";
import { heroById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import { useLiveMatch } from "../hooks/useLiveMatch";
import { fetchSteamProfiles } from "../services/profile-api";
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
}: {
  match: LiveMatch;
  team: Team;
  accountId: number;
  names: Map<number, string>;
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
            const hero = heroById.get(p.heroId);
            const heroName = hero?.name ?? `Hero ${p.heroId}`;
            const name = names.get(p.accountId) ?? `Player ${p.accountId}`;
            const current = p.accountId === accountId;
            return (
              <li
                key={index}
                className={current ? "current" : undefined}
                aria-current={current ? "true" : undefined}
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
                </span>
              </li>
            );
          })}
      </ul>
      {left && (
        <>
          <h4>Objectives standing</h4>
          <dl className="live-objectives">
            <div>
              <dt>Guardians</dt>
              <dd>{left.guardians} / 3</dd>
            </div>
            <div>
              <dt>Walkers</dt>
              <dd>{left.walkers} / 3</dd>
            </div>
            <div>
              <dt>Base Guardians</dt>
              <dd>{left.baseGuardians} / 3</dd>
            </div>
            <div>
              <dt>Shrines</dt>
              <dd>{left.shrines} / 2</dd>
            </div>
            <div>
              <dt>Patron</dt>
              <dd>{PATRON[left.patron]}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
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
}: {
  match: LiveMatch;
  accountId: number;
}) {
  const ids = match.players.map((p) => p.accountId).filter((id) => id > 0);
  const { data: profiles } = useAsync(
    () => fetchSteamProfiles(ids),
    [ids.join(",")],
  );
  const names = new Map(profiles?.map((p) => [p.accountId, p.name]));
  const [amber, sapphire] = TEAMS.map((team) => match.teams[team]);
  return (
    <>
      <SectionHeader title="Live match" />
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
      <div className="live-teams">
        {TEAMS.map((team) => (
          <LiveTeam key={team} {...{ match, team, accountId, names }} />
        ))}
      </div>
      <p className="data-note">
        From the game&apos;s Watch list, through Deadlock API.
      </p>
    </>
  );
}

export function LiveTab({ accountId }: { accountId: number }) {
  const live = useLiveMatch(accountId);
  // Retry goes with its notice as soon as it's pressed: focus moves to the
  // status, which says what is being checked, rather than falling to the
  // page.
  const status = useRef<HTMLParagraphElement>(null);
  const retry = () => {
    status.current?.focus();
    live.retry();
  };
  return (
    <div className="live-tab">
      <p className="live-status" role="status" ref={status} tabIndex={-1}>
        {live.loading &&
          (live.match === undefined
            ? "Looking for a live match…"
            : live.error && "Checking again…")}
      </p>
      {live.error && !live.loading && (
        <p className="notice warning" role="status">
          {live.match === undefined
            ? `Live matches unavailable: ${live.error}`
            : `Couldn't check again: ${live.error}`}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      {live.match === null && (
        <LiveEmpty title="No live match found">
          Live matches show here only while the game&apos;s Watch list has them:
          about the top 200 matches being played.
        </LiveEmpty>
      )}
      {live.match && <LiveMatchView match={live.match} accountId={accountId} />}
    </div>
  );
}
