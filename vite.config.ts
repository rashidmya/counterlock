import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const entry = (path: string) =>
  fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  root: "src",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
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
});
