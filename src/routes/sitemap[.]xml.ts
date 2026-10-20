import { createFileRoute } from "@tanstack/react-router";
import { buildSitemap, originFromRequest, textResponse } from "@/lib/seo-feed";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        textResponse(await buildSitemap(originFromRequest(request)), "application/xml; charset=utf-8"),
    },
  },
});
