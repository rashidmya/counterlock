import { StatsClient } from "@/features/player-stats/services/StatsClient";
import { applyInfo, initialState } from "../utils/game";
import type { MatchState, CounterlockStore } from "../types";

export class LiveStore implements CounterlockStore {
  private state = initialState();
  private listeners = new Set<() => void>();
  private client = new StatsClient();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private generation = 0;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  patch(next: Partial<MatchState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
  reset() {
    this.generation++;
    this.patch(initialState());
  }
  ingest(payload: unknown) {
    const next = applyInfo(this.state, payload);
    const changed =
      next.matchId !== this.state.matchId ||
      next.gameMode !== this.state.gameMode ||
      next.players.map((p) => `${p.slot}:${p.accountId}`).join() !==
        this.state.players.map((p) => `${p.slot}:${p.accountId}`).join();
    if (changed) this.generation++;
    this.patch(next);
    if (changed) this.refresh();
  }
  refresh = () => {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loadStats(), 750);
  };
  private async loadStats() {
    if (this.running) {
      this.refresh();
      return;
    }
    const ids = this.state.players
      .map((p) => p.accountId)
      .filter((id): id is number => id !== null);
    if (!ids.length) {
      this.patch({ loading: false });
      return;
    }
    const generation = this.generation;
    this.running = true;
    this.patch({ loading: true });
    try {
      const stats = await this.client.load(ids, this.state.gameMode);
      if (generation === this.generation) this.patch({ stats });
    } finally {
      this.running = false;
      this.patch({ loading: false });
    }
  }
}
