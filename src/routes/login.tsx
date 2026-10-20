import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: () => <Navigate to="/admin" />,
  head: () => ({
    meta: [{ title: "Painel" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});
