import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../build/client", import.meta.url));
const port = Number(process.env.PORT ?? 5187);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const isFile = (path) => existsSync(path) && statSync(path).isFile();

function resolve(pathname) {
  const path = normalize(join(root, pathname));
  if (!path.startsWith(root)) return undefined;
  return [path, join(path, "index.html"), `${path}.html`].find(isFile);
}

function send(response, status, file) {
  response.writeHead(status, {
    "Content-Type": types[extname(file)] ?? "application/octet-stream",
  });
  response.end(readFileSync(file));
}

createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  } catch {
    pathname = "/404";
  }
  const file = resolve(pathname);
  if (file) return send(response, 200, file);
  if (pathname.startsWith("/players/") || pathname.startsWith("/matches/"))
    return send(response, 200, join(root, "__spa-fallback.html"));
  send(response, 404, join(root, "404.html"));
}).listen(port, "127.0.0.1", () =>
  console.log(`Serving ${root} on http://127.0.0.1:${port}`),
);
