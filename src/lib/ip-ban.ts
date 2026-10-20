import { getSql } from "@/lib/db";

const CACHE_MS = 10_000;
let cache: { at: number; ips: Set<string> } | null = null;

async function loadBanned() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ips;
  const sql = await getSql();
  const rows = await sql<{ ip: string }>`
    select ip from blocked_ips where expires_at is null or expires_at > now()
  `;
  cache = { at: Date.now(), ips: new Set(rows.map((r) => r.ip)) };
  return cache.ips;
}

export function invalidateIpBanCache() {
  cache = null;
}

export async function isIpBanned(ip: string | null | undefined) {
  if (!ip || ip === "desconhecido") return false;
  try {
    return (await loadBanned()).has(ip);
  } catch {
    return false;
  }
}

/** Throws a generic error for banned IPs and counts the attempt. */
export async function assertIpAllowed(ip: string | null | undefined) {
  if (!(await isIpBanned(ip))) return;
  try {
    const sql = await getSql();
    await sql`update blocked_ips set hits = hits + 1 where ip = ${ip!}`;
  } catch {
    /* best effort */
  }
  throw new Error("Acesso bloqueado. Fale com o suporte se acha que isso é um engano.");
}
