import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const TOKENS = join(root, "src/app/styles/tokens.css");

const PALETTE: Record<string, string> = {
  "--ink": "#0c0b0a",
  "--surface": "#12100e",
  "--surface-2": "#171512",
  "--line": "#3a3226",
  "--line-soft": "#2a241c",
  "--cream": "#ece0c4",
  "--muted": "#a89d86",
  "--dim": "#7d7462",
  "--gold": "#d9a441",
  "--tier-gold": "#f2c66d",
  "--poster-red": "#c8432f",
  "--good": "#7fd39a",
  "--bad": "#e07a5f",
  "--ally": "#5a8f9c",
  "--enemy": "#9c5a4a",
  "--weapon": "#c97a2c",
  "--vitality": "#5e9b4a",
  "--spirit": "#8e6fc9",
  "--tier-s": "#f2c66d",
  "--tier-a": "#e9d9a8",
  "--tier-b": "#cdbf9f",
  "--tier-c": "#a99c82",
  "--tier-d": "#8d8271",
};

// Files that still contain hex colours. Each later task removes its files; the last task asserts this is empty.
const LEGACY = new Set([
  "src/app/styles/shell.css",
  "src/app/styles/layout.css",
  "src/app/styles/shared.css",
  "src/features/builds/styles/builds.css",
  "src/features/counters/styles/counters.css",
  "src/features/overlay/styles/panels.css",
  "src/features/overlay/styles/settings.css",
  "src/features/roster/styles/roster.css",
  "src/features/roster/styles/inventory.css",
  "src/features/items/styles/items.css",
  "src/features/live/styles/live.css",
  "web/app/styles/web.css",
]);

const CSS_HEX = /#[0-9a-f]{3,8}\b/i;
const TSX_HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6})\b/i;

function walk(dir: string, skip: string[] = []): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (skip.includes(name)) return [];
    return statSync(path).isDirectory() ? walk(path, skip) : [path];
  });
}

describe("noir theme", () => {
  it("tokens.css defines the palette exactly", () => {
    const css = readFileSync(TOKENS, "utf8");
    const tokens: Record<string, string> = {};
    for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens[name] = value.trim();
    }
    for (const [name, value] of Object.entries(PALETTE)) {
      expect(tokens[name], name).toBe(value);
    }
  });

  it("no hex colours outside tokens.css except legacy files", () => {
    const files = [
      ...walk(join(root, "src")).filter((f) => /\.(css|tsx)$/.test(f)),
      ...walk(join(root, "web/app"), ["build"]).filter((f) =>
        f.endsWith(".css"),
      ),
    ];
    const offenders = files
      .filter((file) => file !== TOKENS)
      .filter((file) =>
        (file.endsWith(".css") ? CSS_HEX : TSX_HEX).test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(root, file));
    expect(offenders.filter((file) => !LEGACY.has(file))).toEqual([]);
  });

  it("legacy list only names files that still exist", () => {
    expect([...LEGACY].filter((file) => !existsSync(join(root, file)))).toEqual(
      [],
    );
  });
});
