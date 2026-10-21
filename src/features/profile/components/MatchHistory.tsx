import { useEffect, useState } from "react";
import { RouteLink } from "@/app/links";
import { heroById } from "@/shared/catalog";
import { gameIcons } from "@/shared/ui/gameIcons";
import { Picture } from "@/shared/ui/Picture";
import { SectionHeader } from "@/shared/ui/SectionHeader";
import type { HistoryFilter, HistoryMatch } from "../types";
import { compactSouls, duration, timeAgo } from "../utils/format";
import { isWin, matchesFilter, modeLabel } from "../utils/match-history";
import { HistoryFilterButtons } from "./HistoryFilterButtons";
import { MatchDetail } from "./MatchDetail";

const PAGE_SIZE = 20;
const PREVIEW_SIZE = 3;

export function MatchHistory({
  matches,
  filter = "all",
  onFilter = () => undefined,
  accountId,
  preview = false,
  onShowAll,
}: {
  matches: HistoryMatch[];
  filter?: HistoryFilter;
  onFilter?(filter: HistoryFilter): void;
  accountId: number;
  preview?: boolean;
  onShowAll?(): void;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => setVisible(PAGE_SIZE), [filter]);
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
        {filtered.slice(0, visible).map((match) => {
          const hero = heroById.get(match.heroId);
          const name = hero?.name ?? `Hero ${match.heroId}`;
          const won = isWin(match);
          const expanded = open === match.matchId;
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
                <button
                  className="match-toggle"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : match.matchId)}
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
                </button>
              </div>
              {expanded && (
                <MatchDetail matchId={match.matchId} accountId={accountId} />
              )}
            </li>
          );
        })}
      </ul>
      {!preview && filtered.length > visible && (
        <button
          className="show-more"
          onClick={() => setVisible(visible + PAGE_SIZE)}
        >
          Show more
        </button>
      )}
    </section>
  );
}
