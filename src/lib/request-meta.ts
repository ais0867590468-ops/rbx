import {
  getRequestHeader,
  getRequestIP,
  getRequestUrl,
} from "@tanstack/react-start/server";

export function getClientMeta() {
  const forwarded = getRequestHeader("x-forwarded-for");
  const ip =
    getRequestIP({ xForwardedFor: true }) ||
    (forwarded ? forwarded.split(",")[0]?.trim() : undefined) ||
    getRequestHeader("x-real-ip") ||
    getRequestHeader("cf-connecting-ip") ||
    "desconhecido";
  const userAgent = getRequestHeader("user-agent") ?? "";
  const referer = getRequestHeader("referer") ?? "";
  return { ip, userAgent, referer };
}

function decodeHeader(value: string | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value).slice(0, 80);
  } catch {
    return value.slice(0, 80);
  }
}

/** Visitor location when the host provides it (Vercel / Cloudflare headers). */
export function getGeo() {
  const country =
    getRequestHeader("x-vercel-ip-country") ?? getRequestHeader("cf-ipcountry") ?? "";
  const city = decodeHeader(getRequestHeader("x-vercel-ip-city"));
  const region = decodeHeader(getRequestHeader("x-vercel-ip-country-region"));
  const language = (getRequestHeader("accept-language") ?? "").split(",")[0]?.trim().slice(0, 20) ?? "";
  return {
    country: /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : "",
    city,
    region,
    language,
  };
}

export function getPublicOrigin() {
  try {
    const url = getRequestUrl({ xForwardedHost: true, xForwardedProto: true });
    return url.origin;
  } catch {
    return "";
  }
}
