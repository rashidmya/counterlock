import { useEffect, useRef, useState } from "react";
import { RouteLink } from "@/app/links";
import { useAsync } from "@/shared/api/useAsync";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import {
  fetchMatchReport,
  fetchPlayerNames,
  fetchRankCurve,
} from "../services/match-report";
import {
  defaultPerspective,
  optionLabel,
  viewNote,
} from "../utils/perspective";
import { lobbyBadge } from "../utils/rank-curve";
import { NORMAL_MODE, type MatchReport } from "../utils/report";
import { CopyLinkButton } from "./CopyLinkButton";
import { PlayerInsights } from "./PlayerInsights";
import { ReportBanner } from "./ReportBanner";
import { ReportGraph } from "./ReportGraph";
import { Scoreboard } from "./Scoreboard";
import { Verdicts } from "./Verdicts";

const NO_NAMES = new Map<number, string>();

function Report({
  report,
  fromId,
  meId,
}: {
  report: MatchReport;
  fromId?: number;
  meId: number | null;
}) {
  const names =
    useAsync(
      () => fetchPlayerNames(report.players.map((p) => p.accountId)),
      [report.matchId],
    ).data ?? NO_NAMES;
  // Until the viewer picks someone, the default follows `meId`, which the
  // website only learns after its first render.
  const [picked, setPicked] = useState<{ slot: number | null } | null>(null);
  const slot = picked ? picked.slot : defaultPerspective(report, meId, fromId);
  const selected = report.players.find((p) => p.slot === slot);
  const badge = selected ? selected.badge || lobbyBadge(report.players) : 0;
  const normal = report.gameMode === NORMAL_MODE;
  const curve = useAsync(
    selected && normal
      ? () => fetchRankCurve(selected.heroId, badge, report.durationS)
      : null,
    [selected?.heroId, badge, report.durationS],
  );
  const top = useRef<HTMLDivElement>(null);
  const viewing = useRef<HTMLSelectElement>(null);
  const refocus = useRef(false);
  // Focus once the selector names the new player, so it is read out.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    viewing.current?.focus({ preventScroll: true });
  }, [slot]);
  const select = (next: number | null) => setPicked({ slot: next });
  // "View as" sits far down the page: bring the new point of view into
  // sight and move focus to the selector, which now names that player.
  const viewAs = (next: number) => {
    select(next);
    if (next === slot) viewing.current?.focus({ preventScroll: true });
    else refocus.current = true;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    top.current?.scrollIntoView({
      block: "start",
      behavior: still ? "auto" : "smooth",
    });
  };
  return (
    <>
      <div className="report-bar" ref={top}>
        <RouteLink
          className="report-back"
          route={
            fromId === undefined
              ? { page: "home" }
              : { page: "profile", accountId: fromId }
          }
        >
          {fromId === undefined ? "← Home" : "← Back to profile"}
        </RouteLink>
        <label className="view-as">
          Viewing as
          <select
            ref={viewing}
            value={slot ?? "all"}
            onChange={(event) =>
              select(
                event.target.value === "all"
                  ? null
                  : Number(event.target.value),
              )
            }
          >
            <option value="all">Whole match (no player)</option>
            {report.players.map((p) => (
              <option key={p.slot} value={p.slot}>
                {optionLabel(p, names, meId)}
              </option>
            ))}
          </select>
        </label>
        <CopyLinkButton
          matchId={report.matchId}
          accountId={selected?.accountId}
        />
      </div>
      <p className="report-note">{viewNote(selected, names, meId)}</p>
      <ReportBanner {...{ report, selected, names, meId }} />
      {selected && (
        <Verdicts
          player={selected}
          durationS={report.durationS}
          curve={curve}
          normal={normal}
        />
      )}
      <SectionHeader title="Graph" />
      <ReportGraph
        {...{ report, names, meId, selected }}
        curve={curve}
        normal={normal}
        onSelect={viewAs}
      />
      {selected ? (
        <PlayerInsights
          player={selected}
          report={report}
          curve={curve.data ?? null}
          curveLoading={curve.loading}
          curveFailed={!!curve.error}
          names={names}
          meId={meId}
        />
      ) : (
        <p className="muted report-pick">
          Pick a player in “Viewing as” to see their verdicts, best and worst
          stretches and impact.
        </p>
      )}
      <SectionHeader title="Scoreboard" />
      <Scoreboard
        {...{ report, names, meId }}
        selected={slot}
        onSelect={viewAs}
      />
    </>
  );
}

export function MatchReportPage({
  matchId,
  fromId,
  meId,
}: {
  matchId: number;
  fromId?: number;
  meId: number | null;
}) {
  const report = useAsync(() => fetchMatchReport(matchId), [matchId]);
  return (
    <section className="match-report">
      {report.loading && <p className="muted">Loading match…</p>}
      {report.error && (
        <p className="notice warning" role="status">
          Match details unavailable
          <button type="button" onClick={report.retry}>
            Retry
          </button>
        </p>
      )}
      {report.data && (
        <Report report={report.data} fromId={fromId} meId={meId} />
      )}
    </section>
  );
}
