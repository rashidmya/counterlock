import { reactRouter } from "@react-router/dev/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: here("."),
  resolve: {
    alias: { "@": here("../src") },
  },
  publicDir: "../public",
  define: { "import.meta.env.VITE_ASSET_BASE": JSON.stringify("/") },
  plugins: [reactRouter()],
});
