import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/customers";
import { getSql } from "@/lib/db";
import { setSettings, settingFromEnv } from "@/lib/settings";
import { requireStaff } from "@/lib/staff";
import { hostOf, parseTracking, type TrackingData } from "@/lib/tracking";
import { parseUa } from "@/lib/ua";
import {
  getUtmifyConfig,
  sendOrderToUtmify,
  sendUtmifyTest,
  syncUtmifyPending,
  type UtmifyStatus,
} from "@/lib/utmify";
import { maskSecret } from "@/lib/utils";

/* ───────────────────────── config ───────────────────────── */

export const getUtmifyAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const cfg = await getUtmifyConfig();
    const sql = await getSql();
    const health = await sql<{ ok: number; failed: number; last_ok: string | null }>`
      select count(*) filter (where ok and not is_test)::int as ok,
             count(*) filter (where not ok and not is_test)::int as failed,
             max(created_at) filter (where ok and not is_test) as last_ok
      from utmify_events where created_at > now() - interval '7 days'
    `;
    const lastFail = await sql<{ order_id: string; status: string; error: string | null; created_at: string }>`
      select order_id, status, error, created_at from utmify_events
      where not ok and not is_test order by created_at desc limit 1
    `;
    const cover = await sql<{ total: number; tracked: number }>`
      select count(*)::int as total,
             count(*) filter (where tracking is not null)::int as tracked
      from orders where created_at > now() - interval '30 days'
    `;
    return {
      enabled: cfg.enabled,
      pixelId: cfg.pixelId,
      pixelFromEnv: Boolean(settingFromEnv("utmify_pixel_id")),
      hasToken: Boolean(cfg.token),
      tokenMasked: maskSecret(cfg.token),
      tokenFromEnv: Boolean(settingFromEnv("utmify_api_token")),
      platform: cfg.platform,
      sendWaiting: cfg.sendWaiting,
      feePercent: cfg.feePercent,
      siteUrl: process.env.SITE_URL?.trim() ?? "",
      health: {
        ok7d: health[0]?.ok ?? 0,
        failed7d: health[0]?.failed ?? 0,
        lastOk: health[0]?.last_ok ?? null,
        lastFailure: lastFail[0] ?? null,
      },
      coverage: { total: cover[0]?.total ?? 0, tracked: cover[0]?.tracked ?? 0 },
    };
  });

export const saveUtmifyConfig = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      enabled: z.boolean(),
      pixelId: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/, "Pixel ID inválido (só letras, números, - e _)."),
      /** Empty string keeps the saved token. */
      apiToken: z.string().trim().max(200).optional(),
      clearToken: z.boolean().optional(),
      platform: z.string().trim().min(1).max(40),
      sendWaiting: z.boolean(),
      feePercent: z.number().min(0).max(100),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const patch: Record<string, string> = {
      utmify_enabled: String(data.enabled),
      utmify_pixel_id: data.pixelId,
      utmify_platform: data.platform,
      utmify_send_waiting: String(data.sendWaiting),
      utmify_fee_percent: String(data.feePercent),
    };
    if (data.clearToken) patch.utmify_api_token = "";
    else if (data.apiToken) patch.utmify_api_token = data.apiToken;
    await setSettings(patch);
    await logAudit(context.userId, "utmify.config", {
      ativo: data.enabled,
      pixel: data.pixelId || "—",
      token: data.clearToken ? "removido" : data.apiToken ? "atualizado" : "mantido",
    });
    return { ok: true };
  });

export const testUtmify = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const result = await sendUtmifyTest();
    await logAudit(context.userId, "utmify.teste", { ok: result.ok, status: result.httpStatus ?? "—" });
    return result;
  });

export const resendUtmifyOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      orderId: z.string().max(40),
      status: z.enum(["waiting_payment", "paid", "refused", "refunded", "chargedback"]),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const result = await sendOrderToUtmify(data.orderId, data.status as UtmifyStatus, { force: true });
    await logAudit(context.userId, "utmify.reenvio", { pedido: data.orderId, status: data.status, ok: result.ok });
    return result;
  });

export const syncUtmify = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const res = await syncUtmifyPending(40);
    await logAudit(context.userId, "utmify.sincronizar", { total: res.total, ok: res.ok, falhas: res.failed });
    return res;
  });

/* ───────────────────────── report ───────────────────────── */

type Row = { name: string; visits: number; orders: number; paid: number; revenue: number };

const NONE = "(não informado)";

type Dim = (t: TrackingData, ua: string | null) => string;

const DIMS: Record<string, Dim> = {
  source: (t) => t.utm_source || (t.referrer ? `(ref) ${hostOf(t.referrer) || "externo"}` : "(direto / sem UTM)"),
  medium: (t) => t.utm_medium || NONE,
  campaign: (t) => t.utm_campaign || NONE,
  content: (t) => t.utm_content || NONE,
  term: (t) => t.utm_term || NONE,
  referrer: (t) => hostOf(t.referrer) || "(direto)",
  landing: (t) => (t.landing ? t.landing.split("?")[0] : NONE),
  clickid: (t) =>
    t.fbclid
      ? "Meta Ads (fbclid)"
      : t.gclid
        ? "Google Ads (gclid)"
        : t.ttclid
          ? "TikTok Ads (ttclid)"
          : t.msclkid
            ? "Microsoft Ads (msclkid)"
            : t.kwai_click_id
              ? "Kwai Ads"
              : "Sem click id",
  device: (_t, ua) => parseUa(ua).device,
  language: (t) => t.language || NONE,
};

export const getUtmifyReport = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ days: z.number().int().min(1).max(90).default(7) }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    const since = `${data.days} days`;

    const visits = await sql<{ ip: string | null; user_agent: string | null; detail: string | null; created_at: string }>`
      select ip, user_agent, detail, created_at from event_logs
      where kind = 'visit' and created_at > now() - ${since}::interval
      order by created_at desc limit 20000
    `;
    const orders = await sql<{
      id: string;
      status: string;
      price_cents: number;
      tracking: string | null;
      created_at: string;
      product_name: string;
      payment_method: string | null;
      user_agent: string | null;
      ip: string | null;
    }>`
      select id, status, price_cents, tracking, created_at, product_name, payment_method, user_agent, ip
      from orders where created_at > now() - ${since}::interval
      order by created_at desc limit 5000
    `;
    const events = await sql<{
      id: number;
      order_id: string;
      status: string;
      ok: boolean;
      http_status: number | null;
      error: string | null;
      is_test: boolean;
      created_at: string;
    }>`
      select id, order_id, status, ok, http_status, error, is_test, created_at
      from utmify_events order by created_at desc limit 400
    `;

    const isPaid = (s: string) => s === "paid" || s === "delivered";
    const visitRows = visits.map((v) => {
      let t: TrackingData = {};
      try {
        t = parseTracking(JSON.stringify((JSON.parse(v.detail ?? "{}") as { tracking?: unknown }).tracking ?? {}));
      } catch {
        t = {};
      }
      return { t, ua: v.user_agent, who: t.vid || v.ip || "?", at: v.created_at };
    });
    const orderRows = orders.map((o) => ({ o, t: parseTracking(o.tracking) }));

    const group = (dim: Dim, top = 12): Row[] => {
      const map = new Map<string, { who: Set<string>; row: Row }>();
      const slot = (name: string) => {
        let s = map.get(name);
        if (!s) {
          s = { who: new Set(), row: { name, visits: 0, orders: 0, paid: 0, revenue: 0 } };
          map.set(name, s);
        }
        return s;
      };
      for (const v of visitRows) slot(dim(v.t, v.ua)).who.add(v.who);
      for (const { o, t } of orderRows) {
        const s = slot(dim(t, o.user_agent));
        s.row.orders += 1;
        if (isPaid(o.status)) {
          s.row.paid += 1;
          s.row.revenue += o.price_cents;
        }
      }
      return [...map.values()]
        .map((s) => ({ ...s.row, visits: s.who.size }))
        .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || b.visits - a.visits)
        .slice(0, top);
    };

    const uniqueVisitors = new Set(visitRows.map((v) => v.who)).size;
    const paidOrders = orderRows.filter(({ o }) => isPaid(o.status));
    const revenue = paidOrders.reduce((sum, { o }) => sum + o.price_cents, 0);
    const withUtm = orderRows.filter(({ t }) => t.utm_source || t.fbclid || t.gclid || t.ttclid).length;

    const byDay = new Map<string, { day: string; visitors: Set<string>; orders: number; paid: number; revenue: number }>();
    const day = (iso: string) => {
      const key = new Date(iso).toISOString().slice(0, 10);
      let d = byDay.get(key);
      if (!d) {
        d = { day: key.slice(5), visitors: new Set(), orders: 0, paid: 0, revenue: 0 };
        byDay.set(key, d);
      }
      return d;
    };
    for (const v of visitRows) day(v.at).visitors.add(v.who);
    for (const { o } of orderRows) {
      const d = day(o.created_at);
      d.orders += 1;
      if (isPaid(o.status)) {
        d.paid += 1;
        d.revenue += o.price_cents;
      }
    }

    const latestByOrder = new Map<string, (typeof events)[number]>();
    for (const e of events) {
      if (e.is_test) continue;
      const key = `${e.order_id}:${e.status}`;
      const prev = latestByOrder.get(key);
      if (!prev || (e.ok && !prev.ok)) latestByOrder.set(key, e);
    }
    const sentState = (orderId: string, status: string) => {
      const e = latestByOrder.get(`${orderId}:${status}`);
      return e ? (e.ok ? "ok" : "falhou") : "—";
    };

    return {
      days: data.days,
      totals: {
        visitors: uniqueVisitors,
        pageviews: visits.length,
        orders: orderRows.length,
        paid: paidOrders.length,
        revenue,
        avgTicket: paidOrders.length ? Math.round(revenue / paidOrders.length) : 0,
        conversion: uniqueVisitors ? paidOrders.length / uniqueVisitors : 0,
        withUtmPct: orderRows.length ? withUtm / orderRows.length : 0,
      },
      daily: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, d]) => ({ day: d.day, visitantes: d.visitors.size, pedidos: d.orders, pagos: d.paid, receita: d.revenue / 100 })),
      groups: Object.fromEntries(Object.entries(DIMS).map(([key, dim]) => [key, group(dim)])) as Record<string, Row[]>,
      recent: orderRows.slice(0, 40).map(({ o, t }) => ({
        id: o.id,
        created_at: o.created_at,
        product: o.product_name,
        price_cents: o.price_cents,
        status: o.status,
        method: o.payment_method ?? "pix",
        source: DIMS.source(t, null),
        medium: t.utm_medium ?? "",
        campaign: t.utm_campaign ?? "",
        content: t.utm_content ?? "",
        term: t.utm_term ?? "",
        clickid: DIMS.clickid(t, null),
        referrer: hostOf(t.referrer),
        landing: t.landing ?? "",
        firstSource: t.first_utm_source ?? "",
        language: t.language ?? "",
        screen: t.screen ?? "",
        waiting: sentState(o.id, "waiting_payment"),
        paidSent: sentState(o.id, "paid"),
        ua: parseUa(o.user_agent),
      })),
      events: events.slice(0, 40),
    };
  });
