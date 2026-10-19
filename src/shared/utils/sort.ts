export type SortDir = "asc" | "desc";

function compare(a: unknown, b: unknown) {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return (a as number) - (b as number);
}

const missing = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === "number" && Number.isNaN(value));

export function sortRows<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (missing(left) || missing(right))
      return Number(missing(left)) - Number(missing(right));
    return sign * compare(left, right);
  });
}
