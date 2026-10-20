/**
 * Marketing attribution shared by the browser (capture) and the server (validate + store).
 * Plain strings only — nothing here is trusted until it goes through `cleanTracking`.
 */
import { z } from "zod";

export const TRACKING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "src",
  "sck",
  "fbclid",
  "gclid",
  "ttclid",
  "msclkid",
  "kwai_click_id",
  "referrer",
  "landing",
  "first_utm_source",
  "first_utm_medium",
  "first_utm_campaign",
  "first_referrer",
  "first_landing",
  "first_seen",
  "vid",
  "language",
  "tz",
  "screen",
] as const;

export type TrackingKey = (typeof TRACKING_KEYS)[number];
export type TrackingData = Partial<Record<TrackingKey, string>>;

/** Zod shape accepted from the browser (strings only, bounded). */
export const trackingSchema = z
  .record(z.string().max(40), z.string().max(300))
  .optional();

/** Keeps only known keys, trims and bounds each value. Safe to call on any input. */
export function cleanTracking(input: unknown): TrackingData {
  const out: TrackingData = {};
  if (!input || typeof input !== "object") return out;
  const raw = input as Record<string, unknown>;
  for (const key of TRACKING_KEYS) {
    const v = raw[key];
    if (typeof v !== "string") continue;
    const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 300);
    if (s) out[key] = s;
  }
  return out;
}

export function parseTracking(json: string | null | undefined): TrackingData {
  if (!json) return {};
  try {
    return cleanTracking(JSON.parse(json));
  } catch {
    return {};
  }
}

export function hostOf(url: string | undefined) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
