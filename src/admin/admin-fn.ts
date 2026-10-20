import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  botInviteUrl,
  fetchBotIdentity,
  fetchGuilds,
  fetchTextChannels,
  logDiscord,
  postChannelMessage,
} from "@/lib/discord";
import { getOrder } from "@/lib/orders";
import { getCardPayment, getPixPayment } from "@/lib/gateway";
import { getSettings, setSettings, type SettingKey } from "@/lib/settings";
import { runInBackground } from "@/lib/background";
import { localLimit } from "@/lib/local-limit";
import { ForbiddenError, requireStaff } from "@/lib/staff";
import { logAudit, type CustomerRow } from "@/lib/customers";
import { settingFromEnv } from "@/lib/settings";
import { maskSecret } from "@/lib/utils";

type OrderListRow = {
  id: string;
  product_name: string;
  robux_amount: number;
  price_cents: number;
  roblox_username: string;
  customer_name: string;
  customer_email: string;
  status: string;
  ip: string | null;
  paid_at: string | null;
  created_at: string;
};

type TicketListRow = {
  id: number;
  public_id: string;
  name: string;
  email: string;
  order_id: string | null;
  subject: string;
  status: string;
  ip: string | null;
  created_at: string;
  updated_at: string;
};

type TicketMessageRow = {
  id: number;
  author_role: string;
  author_name: string;
  body: string;
  created_at: string;
};

type LogRow = {
  id: number;
  kind: string;
  ip: string | null;
  user_agent: string | null;
  path: string | null;
  detail: string | null;
  created_at: string;
};

type ProductRow = {
  id: number;
  slug: string;
  name: string;
  robux_amount: number;
  price_cents: number;
  compare_cents: number | null;
  sold_count: number;
  active: boolean;
  image: string;
  badge: string | null;
  sort_order: number;
};

type StaffRow = {
  user_id: string;
  role: string;
  email: string | null;
  name: string | null;
  created_at: string;
};

async function staffOf(userId: string) {
  return requireStaff(userId);
}

export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const staff = await staffOf(context.userId);
    return { userId: context.userId, role: staff.role };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const paid = await sql<{ n: number; total: number }>`
      select count(*)::int as n, coalesce(sum(price_cents), 0)::int as total
      from orders where status in ('paid', 'delivered')
    `;
    const pending = await sql<{ n: number }>`
      select count(*)::int as n from orders where status = 'pending'
    `;
    const openTickets = await sql<{ n: number }>`
      select count(*)::int as n from tickets where status in ('open', 'in_progress', 'waiting')
    `;
    const today = await sql<{ n: number; total: number }>`
      select count(*)::int as n, coalesce(sum(price_cents), 0)::int as total
      from orders
      where status in ('paid', 'delivered')
        and created_at > now() - interval '24 hours'
    `;
    const visits = await sql<{ n: number }>`
      select count(*)::int as n from event_logs
      where kind = 'visit' and created_at > now() - interval '24 hours'
    `;
    const recent = await sql<{
      id: string;
      product_name: string;
      roblox_username: string;
      price_cents: number;
      status: string;
      created_at: string;
    }>`
      select id, product_name, roblox_username, price_cents, status, created_at
      from orders order by created_at desc limit 8
    `;
    const series = await sql<{ day: string; total: number; count: number }>`
      select to_char(created_at, 'YYYY-MM-DD') as day,
             coalesce(sum(price_cents), 0)::int as total,
             count(*)::int as count
      from orders
      where created_at > now() - interval '14 days'
        and status in ('paid', 'delivered')
      group by 1
      order by 1 asc
    `;
    const byStatus = await sql<{ status: string; n: number }>`
      select status, count(*)::int as n from orders group by status order by n desc
    `;
    const byMethod = await sql<{ method: string; n: number; total: number }>`
      select payment_method as method, count(*)::int as n,
             coalesce(sum(price_cents) filter (where status in ('paid','delivered')), 0)::int as total
      from orders group by payment_method
    `;
    const topProducts = await sql<{ name: string; n: number; total: number }>`
      select product_name as name, count(*)::int as n, coalesce(sum(price_cents), 0)::int as total
      from orders where status in ('paid', 'delivered')
      group by product_name order by n desc limit 5
    `;
    const customers = await sql<{ n: number; blocked: number; vip: number }>`
      select count(*)::int as n,
             count(*) filter (where blocked)::int as blocked,
             count(*) filter (where vip)::int as vip
      from customers
    `;
    const errors24h = await sql<{ n: number }>`
      select count(*)::int as n from event_logs
      where kind in ('error', 'webhook_rejected') and created_at > now() - interval '24 hours'
    `;
    const totalOrders = await sql<{ n: number }>`select count(*)::int as n from orders`;
    const activity = await sql<{ id: number; kind: string; path: string | null; created_at: string }>`
      select id, kind, path, created_at from event_logs
      where kind <> 'visit' order by created_at desc limit 8
    `;
    const paidCount = paid[0]?.n ?? 0;
    const orderCount = totalOrders[0]?.n ?? 0;
    return {
      paidCount,
      revenueCents: paid[0]?.total ?? 0,
      avgTicketCents: paidCount > 0 ? Math.round((paid[0]?.total ?? 0) / paidCount) : 0,
      conversionPct: orderCount > 0 ? Math.round((paidCount / orderCount) * 100) : 0,
      pendingCount: pending[0]?.n ?? 0,
      openTickets: openTickets[0]?.n ?? 0,
      visits24h: visits[0]?.n ?? 0,
      paidToday: today[0]?.n ?? 0,
      revenueTodayCents: today[0]?.total ?? 0,
      customersCount: customers[0]?.n ?? 0,
      blockedCount: customers[0]?.blocked ?? 0,
      vipCount: customers[0]?.vip ?? 0,
      errors24h: errors24h[0]?.n ?? 0,
      recent,
      series,
      byStatus,
      byMethod,
      topProducts,
      activity,
    };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ q: z.string().optional(), status: z.string().optional() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const q = data.q?.trim();
    const status = data.status?.trim();
    if (q && status) {
      const like = `%${q}%`;
      return sql<OrderListRow>`
        select id, product_name, robux_amount, price_cents, roblox_username,
               customer_name, customer_email, status, ip, paid_at, created_at
        from orders
        where status = ${status}
          and (id ilike ${like} or roblox_username ilike ${like} or customer_email ilike ${like})
        order by created_at desc
        limit 80
      `;
    }
    if (q) {
      const like = `%${q}%`;
      return sql<OrderListRow>`
        select id, product_name, robux_amount, price_cents, roblox_username,
               customer_name, customer_email, status, ip, paid_at, created_at
        from orders
        where id ilike ${like} or roblox_username ilike ${like} or customer_email ilike ${like}
        order by created_at desc
        limit 80
      `;
    }
    if (status) {
      return sql<OrderListRow>`
        select id, product_name, robux_amount, price_cents, roblox_username,
               customer_name, customer_email, status, ip, paid_at, created_at
        from orders where status = ${status}
        order by created_at desc
        limit 80
      `;
    }
    return sql<OrderListRow>`
      select id, product_name, robux_amount, price_cents, roblox_username,
             customer_name, customer_email, status, ip, paid_at, created_at
      from orders
      order by created_at desc
      limit 80
    `;
  });

export const getAdminOrder = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    return getOrder(data.id);
  });

export const markDelivered = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    await sql`
      update orders set status = 'delivered', delivered_at = now()
      where id = ${data.id} and status in ('paid', 'pending')
    `;
    await logAudit(context.userId, "pedido.entregue", { pedido: data.id });
    return { ok: true };
  });

export const addOrderNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string(), notes: z.string().max(2000) }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    await sql`update orders set notes = ${data.notes} where id = ${data.id}`;
    return { ok: true };
  });

export const refreshOrderPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const order = await getOrder(data.id);
    if (!order?.payment_id) return { order, payment: null as null };
    const payment =
      order.payment_method === "card"
        ? await getCardPayment(order.payment_id)
        : await getPixPayment(order.payment_id);
    return { order, payment };
  });

export const listTicketsAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ status: z.string().optional() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const status = data.status ?? null;
    // last_role tells the list who spoke last ("customer" = waiting for the team).
    return sql<TicketListRow & { last_role: string | null }>`
      select t.id, t.public_id, t.name, t.email, t.order_id, t.subject, t.status, t.ip,
             t.created_at, t.updated_at,
             (select m.author_role from ticket_messages m where m.ticket_id = t.id
              order by m.id desc limit 1) as last_role
      from tickets t
      where (${status}::text is null or t.status = ${status})
      order by t.updated_at desc limit 80
    `;
  });

export const getTicketAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const tickets = await sql<TicketListRow>`
      select id, public_id, name, email, order_id, subject, status, ip, created_at, updated_at
      from tickets where id = ${data.id} limit 1
    `;
    const ticket = tickets[0];
    if (!ticket) return null;
    const messages = await sql<TicketMessageRow>`
      select id, author_role, author_name, body, created_at
      from ticket_messages where ticket_id = ${data.id} order by id asc
    `;
    return { ticket, messages };
  });

export const replyTicketAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number(),
      body: z.string().min(1).max(4000),
      status: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const text = data.body.trim();
    const rows = await sql<{ id: number; created_at: string }>`
      insert into ticket_messages (ticket_id, author_role, author_name, body)
      values (${data.id}, 'admin', 'Equipe RecargasBuxs', ${text})
      returning id, created_at
    `;
    const status = data.status ?? "waiting";
    await sql`
      update tickets set status = ${status}, updated_at = now(), admin_typing_at = null
      where id = ${data.id}
    `;
    const t = await sql<{ public_id: string; email: string; subject: string }>`
      select public_id, email, subject from tickets where id = ${data.id}
    `;
    if (t[0]) {
      // Discord is notified in the background so the reply shows up instantly.
      runInBackground(
        logDiscord("tickets", {
          title: "Resposta no ticket",
          description: t[0].subject,
          fields: [
            { name: "Código", value: t[0].public_id, inline: true },
            { name: "Cliente", value: t[0].email, inline: true },
            { name: "Resposta", value: text.slice(0, 400) },
          ],
        }),
      );
    }
    return {
      ok: true,
      status,
      message: {
        id: rows[0].id,
        author_role: "admin",
        author_name: "Equipe RecargasBuxs",
        body: text,
        created_at: rows[0].created_at,
      },
    };
  });

/**
 * Live chat poll for the admin ticket page: returns only messages newer than `after`,
 * the current status and whether the customer is typing / has seen the chat.
 */
export const pollTicketAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number().int(),
      after: z.number().int().min(0),
      typing: z.boolean().optional(),
      visible: z.boolean().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    if (!localLimit(`admin-ticket-poll:${context.userId}`, 200, 60_000)) {
      throw new Error("Muitas consultas.");
    }
    const sql = await getSql();
    const found = await sql<{
      status: string;
      customer_seen_at: string | null;
      typing_age: string | number | null;
    }>`
      select status, customer_seen_at,
             extract(epoch from (now() - customer_typing_at)) as typing_age
      from tickets where id = ${data.id} limit 1
    `;
    const ticket = found[0];
    if (!ticket) return null;
    const messages = await sql<TicketMessageRow>`
      select id, author_role, author_name, body, created_at
      from ticket_messages where ticket_id = ${data.id} and id > ${data.after}
      order by id asc limit 100
    `;
    if (data.typing) {
      await sql`
        update tickets set admin_typing_at = now()
        where id = ${data.id} and (admin_typing_at is null or admin_typing_at < now() - interval '2 seconds')
      `;
    }
    if (data.visible) {
      const fromCustomer = messages.some((m) => m.author_role === "customer");
      await sql`
        update tickets set admin_seen_at = now()
        where id = ${data.id}
          and (${fromCustomer} or admin_seen_at is null or admin_seen_at < now() - interval '10 seconds')
      `;
    }
    const age = ticket.typing_age == null ? null : Number(ticket.typing_age);
    return {
      status: ticket.status,
      messages,
      customerTyping: age != null && age < 5,
      customerSeenAt: ticket.customer_seen_at,
    };
  });

export const deleteTicketAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const found = await sql<{ public_id: string }>`select public_id from tickets where id = ${data.id}`;
    if (!found[0]) return { ok: true };
    await sql`delete from ticket_messages where ticket_id = ${data.id}`;
    await sql`delete from tickets where id = ${data.id}`;
    await logAudit(context.userId, "ticket.excluido", { ticket: found[0].public_id });
    return { ok: true };
  });

export const listLogs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      kind: z.string().optional(),
      q: z.string().max(80).optional(),
      limit: z.number().int().min(50).max(2000).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const like = data.q?.trim() ? `%${data.q.trim()}%` : null;
    const rows = await sql<LogRow>`
      select id, kind, ip, user_agent, path, detail, created_at
      from event_logs
      where (${data.kind ?? null}::text is null or kind = ${data.kind ?? null})
        and (${like}::text is null
             or detail ilike ${like} or ip ilike ${like} or path ilike ${like})
      order by created_at desc limit ${data.limit ?? 200}
    `;
    const stats = await sql<{ kind: string; n: number }>`
      select kind, count(*)::int as n from event_logs
      where created_at > now() - interval '24 hours'
      group by kind order by n desc
    `;
    return { rows, stats };
  });

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const raw = await getSettings();
    const topIps = await sql<{ ip: string; n: number }>`
      select ip, count(*)::int as n from event_logs
      where ip is not null and kind in ('error', 'webhook_rejected', 'checkout')
        and created_at > now() - interval '24 hours'
      group by ip order by n desc limit 8
    `;
    const rejected = await sql<{ n: number }>`
      select count(*)::int as n from event_logs
      where kind = 'webhook_rejected' and created_at > now() - interval '24 hours'
    `;
    const blocked = await sql<{ n: number }>`select count(*)::int as n from customers where blocked`;
    const staffCount = await sql<{ n: number }>`select count(*)::int as n from staff`;
    return {
      checks: [
        { key: "gateway", ok: Boolean(raw.purincash_api_key), label: "Chave do gateway de pagamento", fix: "Defina PURINCASH_API_KEY ou salve em Pagamentos." },
        { key: "secret", ok: Boolean(raw.purincash_webhook_secret), label: "Segredo do webhook (assinatura HMAC)", fix: "Sem ele, nenhum webhook é aceito." },
        { key: "env", ok: Boolean(settingFromEnv("purincash_api_key")), label: "Chaves em variáveis de ambiente (não no banco)", fix: "Coloque PURINCASH_API_KEY e PURINCASH_WEBHOOK_SECRET no Railway/Netlify." },
        { key: "allow", ok: Boolean(process.env.ADMIN_EMAILS?.trim()), label: "Lista de e-mails permitidos no admin (ADMIN_EMAILS)", fix: "Defina ADMIN_EMAILS=seu@email para ninguém mais virar equipe." },
        { key: "db", ok: Boolean(process.env.DATABASE_URL?.trim()), label: "Banco persistente (DATABASE_URL)", fix: "Sem DATABASE_URL os dados ficam só em memória." },
        { key: "discord", ok: Boolean(raw.discord_bot_token), label: "Alertas no Discord ligados", fix: "Conecte o bot na aba Discord." },
      ],
      webhookRejected24h: rejected[0]?.n ?? 0,
      blockedCustomers: blocked[0]?.n ?? 0,
      staffCount: staffCount[0]?.n ?? 0,
      topIps,
    };
  });

export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await staffOf(context.userId);
    const raw = await getSettings();
    return {
      ...raw,
      purincash_api_key_masked: maskSecret(raw.purincash_api_key),
      purincash_webhook_secret_masked: maskSecret(raw.purincash_webhook_secret),
      discord_bot_token_masked: maskSecret(raw.discord_bot_token),
      purincash_api_key: "",
      purincash_webhook_secret: "",
      discord_bot_token: "",
      utmify_api_token: "",
      hasGateway: Boolean(raw.purincash_api_key),
      hasWebhookSecret: Boolean(raw.purincash_webhook_secret),
      hasDiscordToken: Boolean(raw.discord_bot_token),
      gateway_api_key_masked: maskSecret(raw.purincash_api_key),
      gateway_webhook_secret_masked: maskSecret(raw.purincash_webhook_secret),
      hasGatewayKey: Boolean(raw.purincash_api_key),
      gatewayKeyFromEnv: Boolean(settingFromEnv("purincash_api_key")),
      gatewaySecretFromEnv: Boolean(settingFromEnv("purincash_webhook_secret")),
    };
  });

const settingsPatch = z.object({
  purincash_api_key: z.string().optional(),
  purincash_webhook_secret: z.string().optional(),
  discord_bot_token: z.string().optional(),
  discord_client_id: z.string().optional(),
  discord_guild_id: z.string().optional(),
  discord_channel_visits: z.string().optional(),
  discord_channel_checkout: z.string().optional(),
  discord_channel_paid: z.string().optional(),
  discord_channel_tickets: z.string().optional(),
  discord_channel_errors: z.string().optional(),
  discord_channel_customers: z.string().optional(),
  discord_channel_audit: z.string().optional(),
  discord_channel_cart: z.string().optional(),
  discord_channel_pix: z.string().optional(),
  discord_channel_card: z.string().optional(),
  discord_channel_gateway: z.string().optional(),
  discord_channel_report: z.string().optional(),
  site_name: z.string().optional(),
  support_hours: z.string().optional(),
  auto_deliver: z.string().optional(),
});

export const saveAdminSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(settingsPatch)
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const patch: Partial<Record<SettingKey, string>> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== "string") continue;
      if (
        (key === "purincash_api_key" ||
          key === "purincash_webhook_secret" ||
          key === "discord_bot_token") &&
        (value.trim() === "" || value.includes("•"))
      ) {
        continue;
      }
      patch[key as SettingKey] = value.trim();
    }
    await setSettings(patch);
    await logAudit(context.userId, "configuracoes.salvas", { campos: Object.keys(patch).join(", ") });
    return { ok: true };
  });

export const connectDiscord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ token: z.string().min(20) }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const me = await fetchBotIdentity(data.token.trim());
    const guilds = await fetchGuilds(data.token.trim());
    await setSettings({
      discord_bot_token: data.token.trim(),
      discord_client_id: me.id,
      discord_invite_saved: botInviteUrl(me.id),
    });
    await logAudit(context.userId, "discord.bot_conectado", { bot: me.username });
    return {
      id: me.id,
      username: me.username,
      inviteUrl: botInviteUrl(me.id),
      guilds,
    };
  });

export const loadDiscordGuilds = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await staffOf(context.userId);
    const settings = await getSettings();
    if (!settings.discord_bot_token) return { bot: null, guilds: [] as Array<{ id: string; name: string }>, channels: [] as Array<{ id: string; name: string; type: number }>, inviteUrl: "" };
    const me = await fetchBotIdentity(settings.discord_bot_token);
    const guilds = await fetchGuilds(settings.discord_bot_token);
    let channels: Array<{ id: string; name: string; type: number }> = [];
    if (settings.discord_guild_id) {
      channels = await fetchTextChannels(settings.discord_bot_token, settings.discord_guild_id);
    }
    return {
      bot: { id: me.id, username: me.username },
      guilds,
      channels,
      inviteUrl: botInviteUrl(me.id || settings.discord_client_id),
    };
  });

export const loadDiscordChannels = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ guildId: z.string() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const settings = await getSettings();
    if (!settings.discord_bot_token) throw new Error("Bot não configurado.");
    await setSettings({ discord_guild_id: data.guildId });
    return fetchTextChannels(settings.discord_bot_token, data.guildId);
  });

export const testDiscordChannel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ channelId: z.string(), label: z.string() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const settings = await getSettings();
    if (!settings.discord_bot_token) throw new Error("Bot não configurado.");
    await postChannelMessage(settings.discord_bot_token, data.channelId, {
      title: `Canal ${data.label} conectado`,
      description: "Teste enviado pelo painel RecargasBuxs. Os logs deste tipo chegarão aqui.",
    });
    return { ok: true };
  });

export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    return sql<ProductRow>`
      select id, slug, name, robux_amount, price_cents, compare_cents, sold_count,
             active, image, badge, sort_order
      from products order by sort_order asc
    `;
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number(),
      name: z.string().min(2),
      robux_amount: z.number().int().positive(),
      price_cents: z.number().int().positive(),
      compare_cents: z.number().int().nullable(),
      badge: z.string().nullable(),
      active: z.boolean(),
      sort_order: z.number().int(),
    }),
  )
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    await sql`
      update products set
        name = ${data.name},
        robux_amount = ${data.robux_amount},
        price_cents = ${data.price_cents},
        compare_cents = ${data.compare_cents},
        badge = ${data.badge},
        active = ${data.active},
        sort_order = ${data.sort_order}
      where id = ${data.id}
    `;
    return { ok: true };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    return sql<StaffRow>`select user_id, role, email, name, created_at from staff order by created_at asc`;
  });

type CustomerListRow = CustomerRow & {
  orders_count: number;
  paid_count: number;
  total_cents: number;
};

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ q: z.string().max(80).optional(), filter: z.string().optional() }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const like = data.q?.trim() ? `%${data.q.trim()}%` : null;
    const f = data.filter ?? "";
    return sql<CustomerListRow>`
      select c.*,
        coalesce(o.orders_count, 0)::int as orders_count,
        coalesce(o.paid_count, 0)::int as paid_count,
        coalesce(o.total_cents, 0)::int as total_cents
      from customers c
      left join (
        select customer_email,
               count(*) as orders_count,
               count(*) filter (where status in ('paid','delivered')) as paid_count,
               sum(price_cents) filter (where status in ('paid','delivered')) as total_cents
        from orders group by customer_email
      ) o on o.customer_email = c.email
      where (${like}::text is null or c.email ilike ${like} or c.name ilike ${like}
             or c.roblox_username ilike ${like} or c.usernames ilike ${like} or c.last_ip ilike ${like})
        and (${f} = '' or (${f} = 'vip' and c.vip) or (${f} = 'blocked' and c.blocked)
             or (${f} = 'buyers' and coalesce(o.paid_count, 0) > 0))
      order by c.last_seen_at desc
      limit 150
    `;
  });

export const getCustomer = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ email: z.string().max(120) }))
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const email = data.email.trim().toLowerCase();
    const rows = await sql<CustomerRow>`select * from customers where email = ${email} limit 1`;
    const customer = rows[0];
    if (!customer) return null;
    const orders = await sql<{
      id: string;
      product_name: string;
      robux_amount: number;
      price_cents: number;
      roblox_username: string;
      status: string;
      payment_method: string;
      card_brand: string | null;
      card_last4: string | null;
      payer_name: string | null;
      payer_cpf: string | null;
      payer_bank: string | null;
      ip: string | null;
      created_at: string;
    }>`
      select id, product_name, robux_amount, price_cents, roblox_username, status,
             payment_method, card_brand, card_last4, payer_name, payer_cpf, payer_bank, ip, created_at
      from orders where customer_email = ${email} order by created_at desc limit 100
    `;
    const cards = await sql<{ brand: string; last4: string; uses: number; last_use: string }>`
      select coalesce(card_brand, 'card') as brand, card_last4 as last4,
             count(*)::int as uses, max(created_at) as last_use
      from orders where customer_email = ${email} and card_last4 is not null
      group by 1, 2 order by last_use desc
    `;
    const tickets = await sql<{ id: number; public_id: string; subject: string; status: string; created_at: string }>`
      select id, public_id, subject, status, created_at from tickets
      where email = ${email} order by created_at desc limit 30
    `;
    const ips = await sql<{ ip: string; n: number; last_seen: string }>`
      select ip, count(*)::int as n, max(created_at) as last_seen from orders
      where customer_email = ${email} and ip is not null group by ip order by last_seen desc limit 10
    `;
    const timeline = await sql<{ id: number; kind: string; path: string | null; detail: string | null; created_at: string }>`
      select id, kind, path, detail, created_at from event_logs
      where detail ilike ${`%${email}%`} order by created_at desc limit 40
    `;
    const totals = orders
      .filter((o) => o.status === "paid" || o.status === "delivered")
      .reduce((acc, o) => ({ n: acc.n + 1, cents: acc.cents + o.price_cents }), { n: 0, cents: 0 });
    return { customer, orders, cards, tickets, ips, timeline, totals };
  });

export const saveCustomer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      email: z.string().max(120),
      notes: z.string().max(4000),
      tags: z.string().max(200),
      vip: z.boolean(),
      blocked: z.boolean(),
      block_reason: z.string().max(300).nullable(),
    }),
  )
  .handler(async ({ context, data }) => {
    await staffOf(context.userId);
    const sql = await getSql();
    const email = data.email.trim().toLowerCase();
    const before = await sql<{ blocked: boolean }>`select blocked from customers where email = ${email}`;
    await sql`
      update customers set
        notes = ${data.notes}, tags = ${data.tags}, vip = ${data.vip},
        blocked = ${data.blocked}, block_reason = ${data.blocked ? data.block_reason : null}
      where email = ${email}
    `;
    if (before[0] && before[0].blocked !== data.blocked) {
      await logAudit(context.userId, data.blocked ? "cliente.bloqueado" : "cliente.desbloqueado", {
        cliente: email,
        motivo: data.block_reason ?? "—",
      });
    } else {
      await logAudit(context.userId, "cliente.editado", { cliente: email });
    }
    return { ok: true };
  });

export { ForbiddenError };
