import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "app",
  ssr: false,
  prerender: ["/", "/heroes", "/items", "/about"],
} satisfies Config;
