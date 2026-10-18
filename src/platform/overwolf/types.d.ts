import type { CounterlockStore } from "@/features/match/types";

declare global {
  interface Window {
    counterlockStore?: CounterlockStore;
  }
}
