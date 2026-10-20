import { useEffect } from "react";
import { logCartOpen } from "@/site/store-fn";
import { getAttribution } from "@/site/tracking-client";

/**
 * Fires the "carrinho aberto" log as soon as someone opens a product (or its checkout).
 * Fire-and-forget; the server dedupes the same IP + product for 10 minutes.
 */
export function useCartLog(slug: string | undefined) {
  useEffect(() => {
    if (!slug) return;
    logCartOpen({ data: { slug, tracking: getAttribution() } }).catch(() => {});
  }, [slug]);
}
