import { Link, useParams, useSearchParams } from "react-router";
import { accountId } from "@/features/match/utils/game";
import { MatchReportPage } from "@/features/match-report/components/MatchReportPage";
import { matchPath } from "@/shared/site";
import { useRememberedMe } from "../remembered";
import { PageMeta } from "../seo";

const matchIdOf = (value: string | undefined) =>
  value &&
  /^\d+$/.test(value) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0
    ? Number(value)
    : null;

export default function MatchRoute() {
  const { matchId } = useParams();
  const [params] = useSearchParams();
  const { meId } = useRememberedMe();
  const match = matchIdOf(matchId);
  // An account id or SteamID64, as on player pages; 0 and junk are ignored.
  const player = accountId(params.get("player")) ?? undefined;
  if (match === null)
    return (
      <section className="web-not-found">
        <title>Invalid match | Counterlock</title>
        <meta name="robots" content="noindex" />
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
