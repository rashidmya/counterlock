import { useEffect, useState } from "react";
import type { Navigate } from "@/app/navigation";
import { heroById } from "@/shared/catalog";
import { gameIcons } from "@/shared/ui/gameIcons";
import { Picture } from "@/shared/ui/Picture";
import type { HistoryFilter, HistoryMatch } from "../types";
import { compactSouls, duration, timeAgo } from "../utils/format";
import { isWin, matchesFilter, modeLabel } from "../utils/match-history";
import { HistoryFilterButtons } from "./HistoryFilterButtons";
import { MatchDetail } from "./MatchDetail";

const PAGE_SIZE = 20;

export function MatchHistory({
  matches,
  filter,
  onFilter,
  accountId,
  navigate,
}: {
  matches: HistoryMatch[];
  filter: HistoryFilter;
  onFilter(filter: HistoryFilter): void;
  accountId: number;
  navigate: Navigate;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => setVisible(PAGE_SIZE), [filter]);
  const filtered = matches.filter((m) => matchesFilter(m, filter));
  return (
    <section className="match-history">
      <div className="section-head">
        <p className="eyebrow">MATCH HISTORY</p>
        <HistoryFilterButtons value={filter} onChange={onFilter} />
      </div>
      {!filtered.length && <p className="muted">No recorded matches</p>}
      <ul>
        {filtered.slice(0, visible).map((match) => {
          const hero = heroById.get(match.heroId);
          const name = hero?.name ?? `Hero ${match.heroId}`;
          const won = isWin(match);
          const expanded = open === match.matchId;
          return (
            <li key={match.matchId} className="match-entry">
              <div className="match-row">
                <button
                  className="hero-link"
                  onClick={() =>
                    navigate({ page: "heroes", heroId: match.heroId })
                  }
                >
                  <Picture
                    className="hero-portrait"
                    src={hero?.image}
                    label={name}
                  />
                  {name}
                </button>
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
                <MatchDetail
                  matchId={match.matchId}
                  {...{ accountId, navigate }}
                />
              )}
            </li>
          );
        })}
      </ul>
      {filtered.length > visible && (
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
