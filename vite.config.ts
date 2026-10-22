import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const entry = (path: string) =>
  fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig(({ command, mode }) => {
  // The match report's Copy link points at the website; without its address
  // it copies the placeholder (see src/shared/site.ts).
  const env = loadEnv(mode, entry(""), "VITE_");
  if (command === "build" && !env.VITE_SITE_URL?.trim())
    console.warn(
      "VITE_SITE_URL is not set: Copy link in the match report will copy https://counterlock.example links.",
    );
  return {
    root: "src",
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    publicDir: "../public",
    base: "./",
    plugins: [react()],
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      target: "chrome110",
      rollupOptions: {
        input: {
          index: entry("index.html"),
          background: entry("background/background.html"),
          desktop: entry("desktop/desktop.html"),
          in_game: entry("in_game/in_game.html"),
        },
      },
    },
  };
});
