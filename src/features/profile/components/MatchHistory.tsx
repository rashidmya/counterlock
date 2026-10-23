import { RouteLink } from "@/app/links";
import { heroById } from "@/shared/catalog";
import { gameIcons } from "@/shared/ui/gameIcons";
import { Picture } from "@/shared/ui/Picture";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import type { HistoryFilter, HistoryMatch } from "../types";
import { compactSouls, duration, timeAgo } from "../utils/format";
import { isWin, matchesFilter, modeLabel } from "../utils/match-history";
import { HistoryFilterButtons } from "./HistoryFilterButtons";

export const PAGE_SIZE = 20;
const PREVIEW_SIZE = 3;

export function MatchHistory({
  matches,
  filter = "all",
  onFilter = () => undefined,
  shown = PAGE_SIZE,
  onShowMore = () => undefined,
  accountId,
  preview = false,
  onShowAll,
}: {
  matches: HistoryMatch[];
  filter?: HistoryFilter;
  onFilter?(filter: HistoryFilter): void;
  // How many the full list shows: "Show more" adds a page.
  shown?: number;
  onShowMore?(shown: number): void;
  accountId: number;
  preview?: boolean;
  onShowAll?(): void;
}) {
  const filtered = preview
    ? [...matches]
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, PREVIEW_SIZE)
    : matches.filter((m) => matchesFilter(m, filter));
  return (
    <section className="match-history">
      {preview ? (
        <SectionHeader
          title="Recent matches"
          action={
            <button type="button" onClick={onShowAll}>
              All matches →
            </button>
          }
        />
      ) : (
        <>
          <SectionHeader title="All matches" />
          <div className="section-head">
            <HistoryFilterButtons value={filter} onChange={onFilter} />
          </div>
        </>
      )}
      {!filtered.length && <p className="muted">No recorded matches</p>}
      <ul>
        {filtered.slice(0, shown).map((match) => {
          const hero = heroById.get(match.heroId);
          const name = hero?.name ?? `Hero ${match.heroId}`;
          const won = isWin(match);
          return (
            <li
              key={match.matchId}
              className={`match-entry ${won ? "won" : "lost"}`}
            >
              <div className="match-row">
                <RouteLink
                  className="hero-link"
                  route={{ page: "heroes", heroId: match.heroId }}
                >
                  <Picture
                    className="hero-portrait"
                    src={hero?.image}
                    label={name}
                  />
                  {name}
                </RouteLink>
                <RouteLink
                  className="match-open"
                  aria-label={`Report: ${name}, ${won ? "win" : "loss"}, ${match.kills} / ${match.deaths} / ${match.assists}, ${compactSouls(match.netWorth)} souls, ${duration(match.durationS)}, ${modeLabel(match)}, ${timeAgo(match.startTime * 1000)}`}
                  route={{ page: "match", matchId: match.matchId, accountId }}
                >
                  <span className="match-kda">
                    <img src={gameIcons.kill} alt="Kills" />
                    {match.kills} / <img src={gameIcons.death} alt="Deaths" />
                    {match.deaths} / {match.assists}
                  </span>
                  <span className="match-mode">{modeLabel(match)}</span>
                  <span className="with-icon">
                    <img src={gameIcons.souls} alt="Souls" />
                    {compactSouls(match.netWorth)}
                  </span>
                  <span>{duration(match.durationS)}</span>
                  <b className={won ? "win" : "loss"}>{won ? "WIN" : "LOSS"}</b>
                  <span className="match-date">
                    {timeAgo(match.startTime * 1000)}
                  </span>
                  <span className="match-report-link">Report →</span>
                </RouteLink>
              </div>
            </li>
          );
        })}
      </ul>
      {!preview && filtered.length > shown && (
        <button
          className="show-more"
          onClick={() => onShowMore(shown + PAGE_SIZE)}
        >
          Show more
        </button>
      )}
    </section>
  );
}
