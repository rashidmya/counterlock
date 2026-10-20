import { sitemapXml } from "../seo";
import { sitePaths } from "../sitePaths";

export function loader() {
  return new Response(sitemapXml(sitePaths()), {
    headers: { "Content-Type": "application/xml" },
  });
}
