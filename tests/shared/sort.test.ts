import { describe, expect, it } from "vitest";
import { sortRows } from "@/shared/utils/sort";

interface Row {
  id: string;
  n: number | null;
  s: string | null;
}
const row = (id: string, n: number | null, s: string | null = null): Row => ({
  id,
  n,
  s,
});
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("sortRows", () => {
  const rows = [row("a", 2), row("b", 9), row("c", 5)];

  it("sorts numbers descending and ascending", () => {
    expect(ids(sortRows(rows, "n", "desc"))).toEqual(["b", "c", "a"]);
    expect(ids(sortRows(rows, "n", "asc"))).toEqual(["a", "c", "b"]);
  });

  it("sorts strings with localeCompare", () => {
    const named = [
      row("1", 0, "banana"),
      row("2", 0, "Apple"),
      row("3", 0, "cherry"),
    ];
    expect(ids(sortRows(named, "s", "asc"))).toEqual(["2", "1", "3"]);
    expect(ids(sortRows(named, "s", "desc"))).toEqual(["3", "1", "2"]);
  });

  it("keeps nulls last in both directions", () => {
    const withNull = [row("a", null), row("b", 1), row("c", 3), row("d", null)];
    expect(ids(sortRows(withNull, "n", "desc"))).toEqual(["c", "b", "a", "d"]);
    expect(ids(sortRows(withNull, "n", "asc"))).toEqual(["b", "c", "a", "d"]);
  });

  it("is stable for ties in both directions", () => {
    const ties = [row("a", 1), row("b", 2), row("c", 1), row("d", 2)];
    expect(ids(sortRows(ties, "n", "desc"))).toEqual(["b", "d", "a", "c"]);
    expect(ids(sortRows(ties, "n", "asc"))).toEqual(["a", "c", "b", "d"]);
  });

  it("does not mutate its input", () => {
    const copy = [...rows];
    sortRows(rows, "n", "asc");
    expect(rows).toEqual(copy);
  });
});
