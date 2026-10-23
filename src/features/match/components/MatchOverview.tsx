import type { MatchState } from "../types";
import type { AnalyticsQuery } from "@/features/heroes/utils/analytics";
import { catalog, heroById } from "@/shared/catalog";
import { BuildPanel } from "@/features/builds/components/BuildPanel";
import { CounterPanel } from "@/features/counters/components/CounterPanel";
import type { useCounters } from "@/features/counters/hooks/useCounters";
import { Team } from "@/features/roster/components/Team";
import { Icon } from "@/shared/ui/Icon";
import { PageTitle } from "@/shared/ui/PageTitle";
import { SectionHeader } from "@/shared/ui/SectionHeader";

interface Props {
  state: MatchState;
  showBuild: boolean;
  showCounters: boolean;
  counters: ReturnType<typeof useCounters>;
  refresh: () => void;
  query: AnalyticsQuery;
  // Inside a page with a title of its own (the profile's Live tab): a
  // section header rather than the page title.
  embedded?: boolean;
}
export function MatchOverview({
  state,
  showBuild,
  showCounters,
  counters,
  refresh,
  query,
  embedded = false,
}: Props) {
  const { teams, selected, setSelected } = counters;
  const missingIds = state.players.filter((p) => !p.accountId).length;
  const errorStats = Object.values(state.stats).some(
    (s) => s.heroError || s.rankError,
  );
  const local = state.players.find((p) => p.local);
  const myHero = local ? heroById.get(local.heroId)?.name : undefined;
  return (
    <>
      <div className="intro">
        {embedded ? (
          <SectionHeader
            title={myHero ? `Live match · ${myHero}` : "Live match"}
          />
        ) : (
          <PageTitle
            eyebrow="Live match"
            title="Know the match."
            ribbon={myHero ? `You're playing ${myHero}` : undefined}
          />
        )}
        <div className="match-clock">
          <span>
            {state.phase === "PostGame"
              ? "MATCH ENDED"
              : state.gameMode === "street_brawl"
                ? "STREET BRAWL"
                : "STANDARD"}
          </span>
          <strong>{state.clock}</strong>
          <small>
            {state.matchId ? `Match #${state.matchId}` : state.status}
          </small>
        </div>
      </div>
      {state.error && (
        <div className="notice warning" role="alert">
          {state.error}
        </div>
      )}
      <div className={`workspace ${showCounters ? "" : "without-counters"}`}>
        <div className="match-column">
          {showBuild && (
            <BuildPanel
              key={state.matchId}
              catalog={catalog}
              state={state}
              query={query}
            />
          )}
          <div className="rosters">
            {teams.team == null && state.players.length > 0 ? (
              <>
                {[2, 3].map((team) => (
                  <Team
                    key={team}
                    title={team === 2 ? "Amber" : "Sapphire"}
                    subtitle="TEAM LINEUP"
                    players={state.players.filter((p) => p.team === team)}
                    {...{ state, selected }}
                    enemy={true}
                    select={setSelected}
                  />
                ))}
                {state.players.some((p) => ![2, 3].includes(p.team)) && (
                  <Team
                    title="Unassigned players"
                    subtitle="Team unavailable"
                    players={state.players.filter(
                      (p) => ![2, 3].includes(p.team),
                    )}
                    {...{ state, selected }}
                    enemy={false}
                    select={setSelected}
                  />
                )}
              </>
            ) : (
              <>
                <Team
                  title="Your team"
                  subtitle={teams.team === 3 ? "SAPPHIRE" : "AMBER"}
                  players={teams.allies}
                  {...{ state, selected }}
                  enemy={false}
                  select={setSelected}
                />
                <Team
                  title="Enemy team"
                  subtitle="SELECT A HERO TO SEE COUNTERS"
                  players={teams.enemies}
                  {...{ state, selected }}
                  enemy
                  select={(slot) =>
                    setSelected(selected === slot ? null : slot)
                  }
                />
              </>
            )}
            <div className="data-note">
              <span>
                {state.loading
                  ? "Loading player statistics…"
                  : `${missingIds ? `${missingIds} player ID${missingIds === 1 ? "" : "s"} unavailable. ` : ""}Hero win rate and games use recorded history; coverage may be incomplete.`}
                {errorStats ? " Some statistics could not be loaded." : ""}
              </span>
              <button
                className="text-button"
                disabled={state.loading}
                onClick={refresh}
              >
                <Icon name="refresh" />
                Refresh
              </button>
            </div>
          </div>
        </div>
        {showCounters && <CounterPanel model={counters} />}
      </div>
    </>
  );
}
