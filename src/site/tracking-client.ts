import { cleanTracking, type TrackingData } from "@/lib/tracking";

const STORE_KEY = "rb_attr_v1";

const PARAM_KEYS = [
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
] as const;

type Stored = { vid: string; firstSeen: string; first: TrackingData; last: TrackingData };

let memory: Stored | null = null;

function read(): Stored | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    /* storage blocked: fall back to memory */
  }
  return memory;
}

function write(value: Stored) {
  memory = value;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function externalReferrer() {
  if (!document.referrer) return "";
  try {
    const u = new URL(document.referrer);
    return u.host === window.location.host ? "" : document.referrer;
  } catch {
    return "";
  }
}

function snapshot(): { data: TrackingData; hasSignal: boolean } {
  const params = new URLSearchParams(window.location.search);
  const data: TrackingData = {};
  let hasSignal = false;
  for (const key of PARAM_KEYS) {
    const v = params.get(key);
    if (v) {
      data[key] = v;
      hasSignal = true;
    }
  }
  const referrer = externalReferrer();
  if (referrer) {
    data.referrer = referrer;
    hasSignal = true;
  }
  data.landing = `${window.location.pathname}${window.location.search}`;
  return { data: cleanTracking(data), hasSignal };
}

/** Called on every page load: remembers first touch + last touch and a visitor id. */
export function captureAttribution() {
  const now = snapshot();
  const stored = read();
  const next: Stored = stored ?? {
    vid: newId(),
    firstSeen: new Date().toISOString(),
    first: now.data,
    last: now.data,
  };
  if (stored && (now.hasSignal || !stored.last)) next.last = now.data;
  write(next);
}

/** Full attribution to send with a visit or a checkout. */
export function getAttribution(): TrackingData {
  let stored = read();
  if (!stored) {
    captureAttribution();
    stored = read();
  }
  const last = stored?.last ?? {};
  const first = stored?.first ?? {};
  const data: TrackingData = {
    ...last,
    first_utm_source: first.utm_source,
    first_utm_medium: first.utm_medium,
    first_utm_campaign: first.utm_campaign,
    first_referrer: first.referrer,
    first_landing: first.landing,
    first_seen: stored?.firstSeen,
    vid: stored?.vid,
    language: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio || 1}`,
  };
  return cleanTracking(data);
}
