import { createFileRoute } from "@tanstack/react-router";
import { handleDiscordInteraction } from "@/lib/discord-interactions";

/** Interactions Endpoint URL of the Discord application (admin app only). */
export const Route = createFileRoute("/api/discord/interactions")({
  server: {
    handlers: {
      GET: () => new Response("ok"),
      POST: ({ request }) => handleDiscordInteraction(request),
    },
  },
});
