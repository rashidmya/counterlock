import { heroById } from "@/shared/catalog";
import { TEAM_NAMES, type MatchReport, type ReportPlayer } from "./report";

export const heroName = (heroId: number) =>
  heroById.get(heroId)?.name ?? `Hero ${heroId}`;

const slotOf = (report: MatchReport, accountId: number | null | undefined) =>
  accountId
    ? report.players.find((p) => p.accountId === accountId)?.slot
    : undefined;

/**
 * Whose point of view the report opens in: the remembered "me" account if it
 * played, otherwise the player the viewer came from (the profile, or the
 * link's ?player=), otherwise the whole match (null).
 */
export function defaultPerspective(
  report: MatchReport,
  meId: number | null,
  fromId?: number,
): number | null {
  return slotOf(report, meId) ?? slotOf(report, fromId) ?? null;
}

export const isMe = (player: ReportPlayer, meId: number | null) =>
  meId !== null && player.accountId === meId;

/** "You" for the remembered account, otherwise the Steam name or the hero. */
export function displayName(
  player: ReportPlayer,
  names: Map<number, string>,
  meId: number | null,
) {
  if (isMe(player, meId)) return "You";
  return names.get(player.accountId) || heroName(player.heroId);
}

/** "Your" for the remembered account, otherwise "somdr's". */
export const possessive = (name: string, me: boolean) =>
  me ? "Your" : `${name}'s`;

/** "Amber · Haze · moealali777 (you)". */
export function optionLabel(
  player: ReportPlayer,
  names: Map<number, string>,
  meId: number | null,
) {
  const name = names.get(player.accountId);
  return [
    TEAM_NAMES[player.team],
    heroName(player.heroId),
    ...(name ? [name] : []),
  ]
    .join(" · ")
    .concat(isMe(player, meId) ? " (you)" : "");
}

export function viewNote(
  player: ReportPlayer | undefined,
  names: Map<number, string>,
  meId: number | null,
) {
  if (!player) return "Whole-match view. Nobody is highlighted.";
  if (isMe(player, meId)) return "This is your match.";
  return `You're viewing ${displayName(player, names, meId)}'s match. Labels and verdicts are from their point of view.`;
}
