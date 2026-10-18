import type { Item, Player, Threat } from "./types";

export const threatLabels: Record<Threat, string> = {
  healing: "Healing",
  bullets: "Bullet damage",
  spirit: "Spirit damage",
  mobility: "Mobility",
  channel: "Channels",
  control: "Crowd control",
};
// Starter matchup profiles. New heroes intentionally need a profile or manual threat selection.
// Item effects verified against the asset catalog on 2026-10-18; these are heuristics, not matchup win-rate claims.
export const heroThreats: Record<number, Threat[]> = {
  1: ["healing", "spirit"],
  2: ["channel", "spirit"],
  3: ["mobility", "bullets"],
  4: ["healing", "spirit"],
  6: ["healing", "control"],
  7: ["bullets", "control"],
  8: ["healing", "bullets"],
  10: ["control", "spirit"],
  11: ["channel", "healing"],
  12: ["healing", "control"],
  13: ["bullets", "channel"],
  14: ["control", "mobility"],
  15: ["channel", "spirit"],
  16: ["mobility", "spirit"],
  17: ["mobility", "spirit"],
  18: ["channel", "control"],
  19: ["healing", "spirit"],
  20: ["healing", "control"],
  25: ["healing", "control"],
  27: ["healing", "mobility"],
  31: ["mobility", "control"],
  35: ["control", "mobility"],
  50: ["spirit", "mobility"],
  52: ["bullets", "control"],
  58: ["bullets", "mobility"],
  60: ["spirit", "mobility"],
  63: ["mobility", "spirit"],
  64: ["mobility", "bullets"],
  65: ["bullets", "control"],
  66: ["healing", "spirit"],
  67: ["healing", "spirit"],
  69: ["spirit", "control"],
  72: ["control", "bullets"],
  76: ["spirit", "control"],
  77: ["mobility", "control"],
  78: ["mobility", "spirit"],
  79: ["healing", "channel"],
  80: ["bullets", "control"],
  81: ["healing", "spirit"],
  84: ["bullets", "spirit"],
  85: ["spirit", "control"],
  86: ["spirit", "control"],
  88: ["spirit", "channel", "control"],
};
const rules: {
  itemId: number;
  threat: Threat;
  reason: string;
  priority: number;
}[] = [
  {
    itemId: 2603935618,
    threat: "healing",
    reason:
      "Apply spirit damage to reduce incoming healing. Useful when you can keep the effect on the target.",
    priority: 5,
  },
  {
    itemId: 3696726732,
    threat: "healing",
    reason:
      "Sustained bullet hits apply bleed and healing reduction. Consider this for a weapon-focused build.",
    priority: 4,
  },
  {
    itemId: 1378931225,
    threat: "bullets",
    reason:
      "Activate during a dangerous bullet burst for temporary bullet immunity. Spirit damage still matters.",
    priority: 5,
  },
  {
    itemId: 3140772621,
    threat: "bullets",
    reason: "Adds bullet resistance, with more protection below half health.",
    priority: 3,
  },
  {
    itemId: 2163598980,
    threat: "spirit",
    reason: "Adds spirit resistance, with more protection below half health.",
    priority: 4,
  },
  {
    itemId: 1813726886,
    threat: "mobility",
    reason:
      "Slows the target and silences movement abilities and items. It does not stop stamina-based movement.",
    priority: 5,
  },
  {
    itemId: 1254091416,
    threat: "channel",
    reason:
      "A delayed stun can interrupt a channel if it lands in time. Account for the delay and enemy protection.",
    priority: 5,
  },
  {
    itemId: 1254091416,
    threat: "mobility",
    reason:
      "A delayed stun lasts longer on airborne targets, helping your team punish exposed flight.",
    priority: 4,
  },
  {
    itemId: 2617435668,
    threat: "channel",
    reason:
      "Interrupts and disables abilities, attacks, and items. Your own damage is reduced during the effect.",
    priority: 4,
  },
  {
    itemId: 1644605047,
    threat: "control",
    reason:
      "Grants a barrier when affected by qualifying control effects, helping you survive the follow-up.",
    priority: 5,
  },
  {
    itemId: 1047818222,
    threat: "control",
    reason:
      "Shortens negative effects. Consider it when repeated control keeps you from fighting or escaping.",
    priority: 4,
  },
];
export interface Recommendation {
  item: Item;
  score: number;
  reasons: string[];
  targets: string[];
}
export function recommend(
  enemies: Player[],
  items: Item[],
  budget: number,
  owned: number[],
  manual: Threat[] = [],
): Recommendation[] {
  const available = new Map(items.map((i) => [i.id, i]));
  const found = new Map<number, Recommendation>();
  for (const rule of rules) {
    const targets = enemies
      .filter((p) => heroThreats[p.heroId]?.includes(rule.threat))
      .map((p) => p.heroName);
    const applies = targets.length > 0 || manual.includes(rule.threat);
    const item = available.get(rule.itemId);
    if (!applies || !item || item.cost > budget || owned.includes(item.id))
      continue;
    const entry = found.get(item.id) ?? {
      item,
      score: 0,
      reasons: [],
      targets: [],
    };
    entry.score += rule.priority + Math.max(0, targets.length - 1) * 2;
    entry.reasons.push(rule.reason);
    entry.targets = [
      ...new Set([
        ...entry.targets,
        ...targets,
        ...(manual.includes(rule.threat) ? [threatLabels[rule.threat]] : []),
      ]),
    ];
    found.set(item.id, entry);
  }
  return [...found.values()]
    .sort(
      (a, b) =>
        b.score - a.score || a.item.cost - b.item.cost || a.item.id - b.item.id,
    )
    .slice(0, 6);
}
