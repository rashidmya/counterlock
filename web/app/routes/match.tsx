import { Link, useParams, useSearchParams } from "react-router";
import { MatchReportPage } from "@/features/match-report/components/MatchReportPage";
import { matchPath } from "@/shared/site";
import { useRememberedMe } from "../remembered";
import { PageMeta } from "../seo";

const id = (value: string | null | undefined) =>
  value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;

export default function MatchRoute() {
  const { matchId } = useParams();
  const [params] = useSearchParams();
  const { meId } = useRememberedMe();
  const match = id(matchId);
  const player = id(params.get("player")) ?? undefined;
  if (match === null)
    return (
      <section className="web-not-found">
        <title>Invalid match | Counterlock</title>
        <h1>That isn&apos;t a valid match ID.</h1>
        <Link to="/">Back to Counterlock</Link>
      </section>
    );
  return (
    <>
      <PageMeta
        title={`Match ${match} | Counterlock`}
        description={`Deadlock match ${match}: souls against the rank average, best and worst stretches, impact and the full scoreboard.`}
        path={matchPath(match)}
      />
      <MatchReportPage
        key={`${match}-${player ?? ""}`}
        matchId={match}
        fromId={player}
        meId={meId}
      />
    </>
  );
}
