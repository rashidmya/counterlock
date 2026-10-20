import { robotsTxt } from "../seo";

export function loader() {
  return new Response(robotsTxt(), {
    headers: { "Content-Type": "text/plain" },
  });
}
