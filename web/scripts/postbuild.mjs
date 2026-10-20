import { copyFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const client = (name) =>
  fileURLToPath(new URL(`../build/client/${name}`, import.meta.url));

writeFileSync(client("_redirects"), "/players/* /__spa-fallback.html 200\n");
copyFileSync(client("__spa-fallback.html"), client("404.html"));

for (const name of [
  "manifest.json",
  "icon.ico",
  "icon-gray.png",
  "sitemap.xml.data",
  "robots.txt.data",
])
  rmSync(client(name), { force: true });
