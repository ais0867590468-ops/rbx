import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "#app-route-tree";

export function getRouter() {
  return createRouter({ routeTree, defaultErrorComponent: AppErrorComponent });
}
