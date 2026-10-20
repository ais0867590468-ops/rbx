import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/admin/components/admin-shell";

export const Route = createFileRoute("/admin")({
  component: AdminShell,
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
});
