import type { MatchState } from "../types";
import { catalog } from "@/shared/catalog";
import { BuildPanel } from "@/features/builds/components/BuildPanel";
import { CounterPanel } from "@/features/counters/components/CounterPanel";
import type { useCounters } from "@/features/counters/hooks/useCounters";
import { Team } from "@/features/roster/components/Team";
import { Icon } from "@/shared/ui/Icon";

interface Props {
  state: MatchState;
  showBuild: boolean;
  showCounters: boolean;
  counters: ReturnType<typeof useCounters>;
  refresh: () => void;
}
export function MatchOverview({
  state,
  showBuild,
  showCounters,
  counters,
  refresh,
}: Props) {
  const { teams, selected, setSelected } = counters;
  const missingIds = state.players.filter((p) => !p.accountId).length;
  const errorStats = Object.values(state.stats).some(
    (s) => s.heroError || s.rankError,
  );
  return (
    <>
      <div className="intro">
        <div>
          <p className="eyebrow">YOUR MATCH, AT A GLANCE</p>
          <h1>A little intel. A better fight.</h1>
          <p className="muted">
            Scout the lineup and find the right answer to their heroes.
          </p>
        </div>
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
            <BuildPanel key={state.matchId} catalog={catalog} state={state} />
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
