import { kGameClassIds } from "./constants";
export type GameInfo = { id?: number; classId?: number; isRunning?: boolean };
export const isDeadlock = (info: GameInfo | null | undefined) =>
  !!info?.isRunning &&
  kGameClassIds.includes(info.classId ?? Math.floor((info.id ?? 0) / 10));
