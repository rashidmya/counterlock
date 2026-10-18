import { mkdir, readFile, writeFile, rename } from "node:fs/promises";

const path = "src/shared/catalog/catalog.json";
const catalog = JSON.parse(await readFile(path, "utf8"));
await mkdir("public/items", { recursive: true });
const queue = [...catalog.items];
let count = 0;
// Bound concurrency; catalog entries only point to a local file after it is saved.
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item?.image) continue;
      if (!Number.isSafeInteger(item.id) || item.id <= 0)
        throw new Error("Invalid item ID");
      const url = new URL(item.image);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "assets-bucket.deadlock-api.com"
      )
        throw new Error(`Unexpected asset source for ${item.name}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok)
        throw new Error(`Cannot download ${item.name}: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type") ?? "";
      const extension = type.includes("webp")
        ? "webp"
        : type.includes("png")
          ? "png"
          : null;
      if (!extension || !bytes.length)
        throw new Error(`Invalid image for ${item.name}`);
      const name = `items/${item.id}.${extension}`;
      await writeFile(`public/${name}`, bytes);
      item.localImage = `./${name}`;
      count++;
    }
  }),
);
await writeFile(`${path}.tmp`, JSON.stringify(catalog, null, 2) + "\n");
await rename(`${path}.tmp`, path);
console.log(`Bundled ${count} game item icons from Deadlock API.`);
