import { StatsClient } from "@/features/player-stats/services/StatsClient";
import { applyInfo, initialState } from "../utils/game";
import type { MatchState, CounterlockStore } from "../types";

export class LiveStore implements CounterlockStore {
  private state = initialState();
  private listeners = new Set<() => void>();
  private client = new StatsClient();
  private timer?: ReturnType<typeof setTimeout>;
  private request?: AbortController;
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
    this.request?.abort();
    clearTimeout(this.timer);
    this.patch(initialState());
  }
  ingest(payload: unknown) {
    const next = applyInfo(this.state, payload);
    const changed =
      next.matchId !== this.state.matchId ||
      next.gameMode !== this.state.gameMode ||
      next.players.map((p) => `${p.slot}:${p.accountId}`).join() !==
        this.state.players.map((p) => `${p.slot}:${p.accountId}`).join();
    if (changed) {
      this.generation++;
      this.request?.abort();
    }
    this.patch(next);
    if (changed) this.refresh();
  }
  refresh = () => {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loadStats(), 750);
  };
  private async loadStats() {
    // Refresh also supersedes an unchanged roster's queued lookup.
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const ids = this.state.players
      .map((p) => p.accountId)
      .filter((id): id is number => id !== null);
    if (!ids.length) {
      this.patch({ loading: false });
      return;
    }
    const generation = this.generation;
    this.patch({ loading: true });
    try {
      const stats = await this.client.load(
        ids,
        this.state.gameMode,
        request.signal,
      );
      if (generation === this.generation && this.request === request)
        this.patch({ stats });
    } catch (error) {
      if (!request.signal.aborted) throw error;
    } finally {
      if (this.request === request) {
        this.request = undefined;
        this.patch({ loading: false });
      }
    }
  }
}
