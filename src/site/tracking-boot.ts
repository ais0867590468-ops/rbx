import { getTrackingConfig } from "@/site/store-fn";

let booted = false;

/**
 * Loads the UTMify scripts (UTM capture + pixel) once per page load, using the
 * pixel id saved in the admin panel. Silent when nothing is configured.
 */
export async function bootUtmify() {
  if (booted || typeof document === "undefined") return;
  booted = true;
  try {
    const { pixelId } = await getTrackingConfig();
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(pixelId)) return;

    const utms = document.createElement("script");
    utms.src = "https://cdn.utmify.com.br/scripts/utms/latest.js";
    utms.async = true;
    utms.defer = true;
    utms.setAttribute("data-utmify-prevent-xcod-sck", "");
    utms.setAttribute("data-utmify-prevent-subids", "");
    document.head.appendChild(utms);

    (window as unknown as { pixelId?: string }).pixelId = pixelId;
    const pixel = document.createElement("script");
    pixel.src = "https://cdn.utmify.com.br/scripts/pixel/pixel.js";
    pixel.async = true;
    pixel.defer = true;
    document.head.appendChild(pixel);
  } catch {
    /* tracking must never break the store */
  }
}
