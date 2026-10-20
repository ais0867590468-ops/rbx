import { createFileRoute } from "@tanstack/react-router";
import { handlePaymentWebhook } from "@/lib/webhook-pagamento";

export const Route = createFileRoute("/webhooks/vulcanopay")({
  server: {
    handlers: {
      GET: () => new Response("ok"),
      POST: ({ request }) => handlePaymentWebhook(request),
    },
  },
});
