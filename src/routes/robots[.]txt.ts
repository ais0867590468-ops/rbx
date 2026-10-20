import { createFileRoute } from "@tanstack/react-router";
import { buildRobots, originFromRequest, textResponse } from "@/lib/seo-feed";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => textResponse(buildRobots(originFromRequest(request))),
    },
  },
});
