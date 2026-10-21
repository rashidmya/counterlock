import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REMEMBERED_KEY,
  clearRemembered,
  readRemembered,
  subscribeRemembered,
  writeRemembered,
} from "../../web/app/remembered";

function stubStorage(overrides: Partial<Storage> = {}) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    ...overrides,
  } as Storage;
  const events = new EventTarget();
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  vi.stubGlobal("localStorage", storage);
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe("remembered web account", () => {
  describe("subscriptions", () => {
    beforeEach(() => void stubStorage());

    it("writeRemembered notifies subscribers in the same tab", () => {
      const callback = vi.fn();
      const stop = subscribeRemembered(callback);
      writeRemembered(5);
      expect(callback).toHaveBeenCalledTimes(1);
      stop();
    });

    it("clearRemembered notifies subscribers", () => {
      const callback = vi.fn();
      const stop = subscribeRemembered(callback);
      clearRemembered();
      expect(callback).toHaveBeenCalledTimes(1);
      stop();
    });

    it("notifies on storage events for the remembered key only", () => {
      const callback = vi.fn();
      const stop = subscribeRemembered(callback);
      const storageEvent = (key: string | null) =>
        Object.assign(new Event("storage"), { key });
      window.dispatchEvent(storageEvent("other"));
      expect(callback).not.toHaveBeenCalled();
      window.dispatchEvent(storageEvent(REMEMBERED_KEY));
      window.dispatchEvent(storageEvent(null));
      expect(callback).toHaveBeenCalledTimes(2);
      stop();
    });

    it("stops notifying after unsubscribe", () => {
      const callback = vi.fn();
      subscribeRemembered(callback)();
      writeRemembered(5);
      clearRemembered();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("with storage", () => {
    let data: Map<string, string>;
    beforeEach(() => {
      data = stubStorage();
    });

    it("uses the documented key and round-trips an id", () => {
      expect(readRemembered()).toBeNull();
      writeRemembered(400239835);
      expect(data.get(REMEMBERED_KEY)).toBe('{"accountId":400239835}');
      expect(REMEMBERED_KEY).toBe("counterlock.web.account");
      expect(readRemembered()).toBe(400239835);
    });

    it("clears the stored account", () => {
      writeRemembered(5);
      clearRemembered();
      expect(readRemembered()).toBeNull();
      expect(data.has(REMEMBERED_KEY)).toBe(false);
    });

    it.each([
      "{oops",
      "null",
      "42",
      '{"accountId":"x"}',
      '{"accountId":-1}',
      '{"accountId":0}',
      '{"accountId":1.5}',
      "{}",
    ])("treats %s as no account", (value) => {
      data.set(REMEMBERED_KEY, value);
      expect(readRemembered()).toBeNull();
    });
  });

  it("is safe when storage throws", () => {
    const boom = () => {
      throw new Error("denied");
    };
    stubStorage({ getItem: boom, setItem: boom, removeItem: boom });
    expect(readRemembered()).toBeNull();
    expect(() => writeRemembered(5)).not.toThrow();
    expect(() => clearRemembered()).not.toThrow();
  });

  it("is safe without a window", () => {
    vi.stubGlobal("window", undefined);
    expect(readRemembered()).toBeNull();
    expect(() => writeRemembered(5)).not.toThrow();
    expect(() => clearRemembered()).not.toThrow();
  });
});
