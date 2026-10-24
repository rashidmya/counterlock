import type { MatchState } from "@/features/match/types";
import { RetryButton } from "@/shared/ui/RetryButton";
import { useOverlayBenchmark } from "../hooks/useOverlayBenchmark";
import {
  localComparison,
  uniqueLocalPlayer,
  type CountComparison,
} from "../utils/meters";

function Count({ label, value }: { label: string; value: CountComparison }) {
  const magnitude = value.delta === null ? null : Math.abs(value.delta);
  const difference =
    magnitude !== null && magnitude > 0 && magnitude < 0.05
      ? "<0.1"
      : magnitude?.toFixed(1);
  return (
    <div className="hud-kda-count" data-stat={label.toLowerCase()}>
      <span className="hud-stat-label">{label}</span>
      <strong className="hud-live">{value.value ?? "—"}</strong>
      <span className="hud-average" title="Rank average">
        {value.average === null ? "—" : value.average.toFixed(1)}
      </span>
      {value.delta !== null && (
        <span
          className={`hud-delta ${value.favorable === null ? "" : value.favorable ? "good" : "bad"}`}
          aria-label={`${label}: ${difference} ${value.delta === 0 ? "equal to" : value.delta > 0 ? "above" : "below"} average`}
        >
          {value.delta === 0 ? "–" : value.delta > 0 ? "▲" : "▼"} {difference}
        </span>
      )}
    </div>
  );
}
export function AveragePanel({ state }: { state: MatchState }) {
  const benchmark = useOverlayBenchmark(state);
  const values = localComparison(state, benchmark.data ?? null);
  const local = uniqueLocalPlayer(state.players);
  if (!values || !local)
    return <p className="hud-empty">Waiting for your hero.</p>;
  const rank = local.accountId ? state.stats[local.accountId] : undefined;
  return (
    <div className="hud-comparison">
      <div className="hud-stat" data-stat="souls">
        <span>Souls / min</span>
        <strong className="hud-live">—</strong>
        <small>Souls / min needs verified total souls.</small>
      </div>
      <div
        className="hud-kda"
        aria-label="K / D / A, your counts and rank averages"
      >
        <Count label="Kills" value={values.kda.kills} />
        <Count label="Deaths" value={values.kda.deaths} />
        <Count label="Assists" value={values.kda.assists} />
      </div>
      <div className="hud-stat" data-stat="level">
        <span>Level</span>
        <strong className="hud-live">{values.level ?? "—"}</strong>
        <small>Average unavailable</small>
      </div>
      <div className="hud-stat" data-stat="participation">
        <span>Kill participation</span>
        <strong className="hud-live">
          {values.killParticipation === null
            ? "—"
            : `${Math.round(values.killParticipation * 100)}%`}
        </strong>
        <small>Average unavailable</small>
      </div>
      {state.gameMode === "street_brawl" ? (
        <p className="hud-note">
          Rank averages are unavailable in Street Brawl.
        </p>
      ) : (
        <>
          {local.accountId && !rank ? (
            <p className="hud-note" role="status">
              Waiting for your rank.
            </p>
          ) : null}
          {rank?.rankError && (
            <p className="hud-note">
              Current rank unavailable; comparing with all ranks.
            </p>
          )}
          {benchmark.loading && (
            <p className="hud-note" role="status">
              Loading rank average…
            </p>
          )}
          {benchmark.error && (
            <div className="hud-notice">
              <p role="status">Rank average unavailable.</p>
              <RetryButton onRetry={benchmark.retry} />
            </div>
          )}
          {benchmark.data && (
            <p className="hud-benchmark">
              {benchmark.data.points.length
                ? `Rank averages, interpolated at ${state.clock} · ${benchmark.data.band.label}`
                : "No rank average available."}
              {benchmark.data.widenedFrom && (
                <span>
                  Widened from {benchmark.data.widenedFrom} for more samples.
                </span>
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
