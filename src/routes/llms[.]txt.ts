import { createFileRoute } from "@tanstack/react-router";
import { buildLlms, originFromRequest, textResponse } from "@/lib/seo-feed";

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        textResponse(await buildLlms(originFromRequest(request)), "text/plain; charset=utf-8"),
    },
  },
});
