/**
 * Gateway health: every PIX / card attempt is recorded, and the panel + Discord can
 * answer "is PIX up? is card up?" at any time.
 *
 *   online   - the latest check worked
 *   unstable - the latest check failed once (could be a blip)
 *   offline  - the 2 latest checks failed in a row
 *   unknown  - nothing recorded in the last 24h
 *
 * A declined card is NOT a failure (see `isGatewayOutage` in gateway.ts): only network
 * errors, 5xx answers and a rejected API key count. When a method flips to/from
 * "offline" the bot posts an alert in the gateway channel.
 */
import { getSql } from "@/lib/db";
import { logDiscord } from "@/lib/discord";
import {
  gatewayStatusEmbed,
  type GatewayHealth,
  type GatewayState,
  type MethodHealth,
} from "@/lib/discord-logs";
import { probeGateway } from "@/lib/gateway";
import { getSetting } from "@/lib/settings";

export type HealthMethod = "pix" | "card";

type Row = {
  id: number;
  method: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  detail: string | null;
  created_at: string;
};

const DAY = 24 * 60 * 60 * 1000;

/** `rows` must be newest first and already limited to this method + manual probes. */
export function stateOf(rows: Array<Pick<Row, "ok" | "created_at">>, now = Date.now()): GatewayState {
  const latest = rows[0];
  if (!latest) return "unknown";
  if (now - new Date(latest.created_at).getTime() > DAY) return "unknown";
  if (latest.ok) return "online";
  return rows[1] && !rows[1].ok ? "offline" : "unstable";
}

function summarize(method: HealthMethod, all: Row[]): MethodHealth {
  const rows = all.filter((r) => r.method === method || r.method === "probe");
  const own = rows.filter((r) => r.method === method);
  const lastOk = rows.find((r) => r.ok);
  const lastFail = rows.find((r) => !r.ok);
  return {
    status: stateOf(rows),
    lastOkAt: lastOk?.created_at ?? null,
    lastFailAt: lastFail?.created_at ?? null,
    lastDetail: rows.find((r) => !r.ok)?.detail ?? null,
    lastLatencyMs: lastOk?.latency_ms ?? null,
    ok24h: own.filter((r) => r.ok).length,
    fail24h: own.filter((r) => !r.ok).length,
  };
}

async function loadRows(): Promise<Row[]> {
  const sql = await getSql();
  return sql<Row>`
    select id, method, ok, status_code, latency_ms, detail, created_at
    from gateway_checks
    where created_at > now() - interval '24 hours'
    order by created_at desc, id desc
    limit 1000
  `;
}

export async function getGatewayHealth(): Promise<GatewayHealth> {
  const rows = await loadRows();
  return { pix: summarize("pix", rows), card: summarize("card", rows) };
}

/** Records one attempt and alerts Discord when a method flips to / from "offline". */
export async function recordGatewayCheck(
  method: HealthMethod | "probe",
  result: { ok: boolean; statusCode?: number; latencyMs?: number; detail?: string },
) {
  try {
    const sql = await getSql();
    const before = await loadRows();
    await sql`
      insert into gateway_checks (method, ok, status_code, latency_ms, detail)
      values (${method}, ${result.ok}, ${result.statusCode ?? null}, ${result.latencyMs ?? null},
              ${result.detail?.slice(0, 300) ?? null})
    `;
    if (Math.random() < 0.02) {
      await sql`delete from gateway_checks where created_at < now() - interval '14 days'`;
    }
    const after = await loadRows();
    const affected: HealthMethod[] = method === "probe" ? ["pix", "card"] : [method];
    for (const m of affected) {
      const was = summarize(m, before).status === "offline";
      const now = summarize(m, after).status === "offline";
      if (was !== now) {
        const health: GatewayHealth = { pix: summarize("pix", after), card: summarize("card", after) };
        await logDiscord("gateway", gatewayStatusEmbed(health, { alert: { method: m, down: now } }));
      }
    }
  } catch (err) {
    console.error("gateway health record failed", err);
  }
}

/** Live check used by the panel button and the Discord "Status dos pagamentos" button. */
export async function runGatewayProbe() {
  const configured = Boolean((await getSetting("purincash_api_key")).trim());
  const probe = await probeGateway();
  if (configured) {
    await recordGatewayCheck("probe", {
      ok: probe.ok,
      statusCode: probe.status,
      latencyMs: probe.latencyMs,
      detail: probe.detail,
    });
  }
  return { configured, probe, health: await getGatewayHealth() };
}
