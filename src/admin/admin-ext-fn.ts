import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { invalidateIpBanCache } from "@/lib/ip-ban";
import { logAudit } from "@/lib/customers";
import { requireStaff } from "@/lib/staff";
import { hashPassword } from "@/lib/shop-auth";
import { randomBytes } from "node:crypto";

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

import { parseUa } from "@/lib/ua";

function sourceOf(detail: string | null) {
  try {
    const d = JSON.parse(detail ?? "{}") as { referer?: string; query?: string };
    const q = new URLSearchParams((d.query ?? "").replace(/^\?/, ""));
    const utm = q.get("utm_source");
    if (utm) return utm.toLowerCase().slice(0, 30);
    if (!d.referer) return "Direto";
    const host = new URL(d.referer).hostname.replace(/^www\./, "");
    if (/google\./.test(host)) return "Google";
    if (/instagram\./.test(host)) return "Instagram";
    if (/tiktok\./.test(host)) return "TikTok";
    if (/youtube\.|youtu\.be/.test(host)) return "YouTube";
    if (/facebook\.|fb\./.test(host)) return "Facebook";
    if (/discord\./.test(host)) return "Discord";
    if (/t\.co|twitter\.|x\.com/.test(host)) return "X / Twitter";
    if (/whatsapp\./.test(host)) return "WhatsApp";
    return host;
  } catch {
    return "Direto";
  }
}

function tally(items: string[], top = 8) {
  const map = new Map<string, number>();
  for (const i of items) map.set(i, (map.get(i) ?? 0) + 1);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, n]) => ({ name, n }));
}

const ipSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[0-9a-fA-F:.]+$/, "IP invÃ¡lido");

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ funnel / analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const getFunnel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ days: z.number().int().min(1).max(90).default(7) }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    const since = `${data.days} days`;

    const visits = await sql<{ ip: string | null; user_agent: string | null; path: string | null; detail: string | null; created_at: string }>`
      select ip, user_agent, path, detail, created_at from event_logs
      where kind = 'visit' and created_at > now() - ${since}::interval
      order by created_at desc limit 8000
    `;
    const uniq = (rows: typeof visits) => new Set(rows.map((v) => v.ip ?? "?")).size;
    const viewed = visits.filter((v) => (v.path ?? "").startsWith("/produto") || (v.path ?? "").startsWith("/comprar"));

    const checkoutIps = await sql<{ n: number }>`
      select count(distinct ip)::int as n from event_logs
      where kind = 'checkout' and created_at > now() - ${since}::interval
    `;
    const orders = await sql<{ created: number; paid: number; delivered: number; cents: number; pix: number; card: number }>`
      select count(*)::int as created,
             count(*) filter (where status in ('paid','delivered'))::int as paid,
             count(*) filter (where status = 'delivered')::int as delivered,
             coalesce(sum(price_cents) filter (where status in ('paid','delivered')), 0)::int as cents,
             count(*) filter (where payment_method = 'pix')::int as pix,
             count(*) filter (where payment_method = 'card')::int as card
      from orders where created_at > now() - ${since}::interval
    `;
    const o = orders[0];

    const stages = [
      { key: "visit", label: "Visitantes Ãºnicos", n: uniq(visits) },
      { key: "view", label: "Viram um pacote", n: uniq(viewed) },
      { key: "checkout", label: "Iniciaram checkout", n: checkoutIps[0]?.n ?? 0 },
      { key: "paid", label: "Pagaram", n: o?.paid ?? 0 },
      { key: "delivered", label: "Receberam", n: o?.delivered ?? 0 },
    ];

    const parsed = visits.map((v) => parseUa(v.user_agent));
    const byDay = new Map<string, number>();
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, n: 0 }));
    for (const v of visits) {
      const d = new Date(v.created_at);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
      byHour[d.getHours()].n += 1;
    }

    const drop = await sql<{ product_name: string; n: number }>`
      select product_name, count(*)::int as n from orders
      where status = 'pending' and created_at > now() - ${since}::interval
      group by product_name order by n desc limit 5
    `;

    return {
      days: data.days,
      stages,
      revenueCents: o?.cents ?? 0,
      pix: o?.pix ?? 0,
      card: o?.card ?? 0,
      ordersCreated: o?.created ?? 0,
      totalVisits: visits.length,
      os: tally(parsed.map((p) => p.os)),
      browsers: tally(parsed.map((p) => p.browser)),
      devices: tally(parsed.map((p) => p.device)),
      sources: tally(visits.map((v) => sourceOf(v.detail))),
      pages: tally(visits.map((v) => v.path ?? "/"), 10),
      daily: [...byDay.entries()].sort().map(([day, n]) => ({ day: day.slice(5), n })),
      hourly: byHour,
      abandoned: drop,
    };
  });

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ IP management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export const listIps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    const banned = await sql<{
      ip: string;
      reason: string;
      banned_by: string | null;
      hits: number;
      created_at: string;
      expires_at: string | null;
    }>`select ip, reason, banned_by, hits, created_at, expires_at from blocked_ips order by created_at desc limit 300`;
    const active = await sql<{
      ip: string;
      visits: number;
      checkouts: number;
      errors: number;
      accounts: number;
      last_seen: string;
      user_agent: string | null;
    }>`
      select ip,
        count(*) filter (where kind = 'visit')::int as visits,
        count(*) filter (where kind = 'checkout')::int as checkouts,
        count(*) filter (where kind in ('error','webhook_rejected'))::int as errors,
        count(*) filter (where kind = 'account')::int as accounts,
        max(created_at) as last_seen,
        (array_agg(user_agent order by created_at desc))[1] as user_agent
      from event_logs
      where ip is not null and ip <> 'desconhecido' and created_at > now() - interval '7 days'
      group by ip
      order by (count(*) filter (where kind in ('error','webhook_rejected'))) desc, count(*) desc
      limit 80
    `;
    const bannedSet = new Set(banned.map((b) => b.ip));
    return {
      banned,
      active: active.map((a) => ({ ...a, ...parseUa(a.user_agent), banned: bannedSet.has(a.ip) })),
    };
  });

export const banIp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      ip: ipSchema,
      reason: z.string().max(200).default(""),
      hours: z.number().int().min(0).max(24 * 365).default(0),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    const expires = data.hours > 0 ? new Date(Date.now() + data.hours * 3600_000).toISOString() : null;
    await sql`
      insert into blocked_ips (ip, reason, banned_by, expires_at)
      values (${data.ip}, ${data.reason}, ${context.userId}, ${expires})
      on conflict (ip) do update set reason = excluded.reason, banned_by = excluded.banned_by,
        expires_at = excluded.expires_at, created_at = now()
    `;
    invalidateIpBanCache();
    await logAudit(context.userId, "ip.banido", {
      ip: data.ip,
      motivo: data.reason || "â€”",
      duracao: data.hours > 0 ? `${data.hours}h` : "permanente",
    });
    return { ok: true };
  });

export const unbanIp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ ip: ipSchema }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    await sql`delete from blocked_ips where ip = ${data.ip}`;
    invalidateIpBanCache();
    await logAudit(context.userId, "ip.desbanido", { ip: data.ip });
    return { ok: true };
  });

export const clearAllBlockedIps = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    await sql`delete from blocked_ips`;
    invalidateIpBanCache();
    await logAudit(context.userId, "ip.todos_desbanidos", {});
    return { ok: true };
  });


/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ store accounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type ShopUserRow = {
  id: string;
  email: string;
  name: string;
  banned: boolean;
  ban_reason: string | null;
  login_count: number;
  signup_ip: string | null;
  last_ip: string | null;
  last_user_agent: string | null;
  created_at: string;
  last_login_at: string | null;
  orders_count: number;
  sessions: number;
};

export const listShopUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ q: z.string().max(80).optional() }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    const like = data.q?.trim() ? `%${data.q.trim()}%` : null;
    const rows = await sql<ShopUserRow>`
      select u.id, u.email, u.name, u.banned, u.ban_reason, u.login_count, u.signup_ip, u.last_ip,
             u.last_user_agent, u.created_at, u.last_login_at,
             (select count(*)::int from orders o where o.customer_email = u.email) as orders_count,
             (select count(*)::int from shop_sessions s where s.user_id = u.id and s.expires_at > now()) as sessions
      from shop_users u
      where (${like}::text is null or u.email ilike ${like} or u.name ilike ${like}
             or u.last_ip ilike ${like} or u.signup_ip ilike ${like})
      order by u.created_at desc limit 300
    `;
    return rows.map((r) => ({ ...r, ...parseUa(r.last_user_agent) }));
  });

export const setShopUserBan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().max(40), banned: z.boolean(), reason: z.string().max(200).default("") }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    const rows = await sql<{ email: string }>`
      update shop_users set banned = ${data.banned}, ban_reason = ${data.banned ? data.reason : null}
      where id = ${data.id} returning email
    `;
    if (data.banned) await sql`delete from shop_sessions where user_id = ${data.id}`;
    await logAudit(context.userId, data.banned ? "login.banido" : "login.desbanido", {
      conta: rows[0]?.email ?? data.id,
      motivo: data.reason || "â€”",
    });
    return { ok: true };
  });

export const deleteShopUser = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().max(40) }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    const rows = await sql<{ email: string }>`delete from shop_users where id = ${data.id} returning email`;
    await logAudit(context.userId, "login.excluido", { conta: rows[0]?.email ?? data.id });
    return { ok: true };
  });

/**
 * Passwords are stored only as salted scrypt hashes, so they can never be
 * read back. Staff can instead set a new one (typed, or generated and shown once).
 */
export const resetShopUserPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().max(40), password: z.string().min(8).max(100).optional() }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    const password = data.password ?? randomBytes(9).toString("base64url");
    const rows = await sql<{ email: string }>`
      update shop_users set password_hash = ${hashPassword(password)} where id = ${data.id} returning email
    `;
    await sql`delete from shop_sessions where user_id = ${data.id}`;
    await logAudit(context.userId, "login.senha_redefinida", { conta: rows[0]?.email ?? data.id });
    return { password };
  });
