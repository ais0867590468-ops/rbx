import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { logDiscord } from "@/lib/discord";
import {
  blockedAttemptEmbed,
  cardGeneratedEmbed,
  cartEmbed,
  checkoutStepEmbed,
  newTicketEmbed,
  paymentFailureEmbed,
  pixGeneratedEmbed,
  type VisitorInfo,
  ticketComponents,
  ticketReplyEmbed,
  visitEmbed,
} from "@/lib/discord-logs";
import { brtMidnight } from "@/lib/discord-report";
import { createCardPayment, createPixPayment, GatewayError, getCardPayment, getPixPayment } from "@/lib/gateway";
import { recordGatewayCheck } from "@/lib/gateway-health";
import { orderId, ticketPublicId, ticketSecret } from "@/lib/ids";
import { getOrder, markOrderPaid } from "@/lib/orders";
import { runInBackground } from "@/lib/background";
import { localLimit } from "@/lib/local-limit";
import { takeRateLimit } from "@/lib/rate-limit";
import { getClientMeta, getGeo, getPublicOrigin } from "@/lib/request-meta";
import { getSetting } from "@/lib/settings";
import { isRobloxUser } from "@/lib/utils";
import { isCustomerBlocked, upsertCustomer } from "@/lib/customers";
import { assertIpAllowed, isIpBanned } from "@/lib/ip-ban";
import { cleanTracking, type TrackingData, trackingSchema } from "@/lib/tracking";
import { getUtmifyConfig, trackOrderEvent } from "@/lib/utmify";

/** Who is on the other side of this request (device, IP, origin, location) for the Discord logs. */
function visitorInfo(tracking?: TrackingData): VisitorInfo {
  const { ip, userAgent, referer } = getClientMeta();
  return { ip, userAgent, referer, geo: getGeo(), tracking };
}

export type Product = {
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

export const listProducts = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  return sql<Product>`
    select id, slug, name, robux_amount, price_cents, compare_cents, sold_count,
           active, image, badge, sort_order
    from products
    where active = true
    order by sort_order asc, id asc
  `;
});

export const getProductBySlug = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<Product>`
      select id, slug, name, robux_amount, price_cents, compare_cents, sold_count,
             active, image, badge, sort_order
      from products where slug = ${data.slug} and active = true limit 1
    `;
    return rows[0] ?? null;
  });

export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  return {
    siteName: await getSetting("site_name"),
    supportHours: await getSetting("support_hours"),
  };
});

/** Public origin of the store (SITE_URL wins) — used for canonical URLs and JSON-LD. */
export const getSiteOrigin = createServerFn({ method: "GET" }).handler(async () => {
  const fixed = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  return fixed || getPublicOrigin();
});

/** Public tracking setup (pixel id only — the API token never leaves the server). */
export const getTrackingConfig = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = await getUtmifyConfig();
  return { pixelId: cfg.enabled ? cfg.pixelId : "" };
});

export const logVisit = createServerFn({ method: "POST" })
  .validator(
    z.object({
      path: z.string().max(200),
      query: z.string().max(500).optional(),
      tracking: trackingSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { ip, userAgent, referer } = getClientMeta();
    if (await isIpBanned(ip)) return { ok: true, deduped: true };
    const sql = await getSql();
    const recent = await sql<{ n: number }>`
      select count(*)::int as n from event_logs
      where kind = 'visit' and ip = ${ip} and path = ${data.path}
        and created_at > now() - interval '10 minutes'
    `;
    if ((recent[0]?.n ?? 0) > 0) return { ok: true, deduped: true };
    // History of this visitor (before the current visit is stored).
    const prior = await sql<{ n: number; last: string | Date | null }>`
      select count(*)::int as n, max(created_at) as last from event_logs
      where kind = 'visit' and ip = ${ip}
    `;
    const tracking = cleanTracking(data.tracking);
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values (
        'visit',
        ${ip},
        ${userAgent},
        ${data.path},
        ${JSON.stringify({ query: data.query ?? "", referer, tracking })}
      )
    `;
    try {
      const since = brtMidnight().toISOString();
      const today = await sql<{ uniq: number; total: number }>`
        select count(distinct ip)::int as uniq, count(*)::int as total from event_logs
        where kind = 'visit' and created_at >= ${since}::timestamptz
      `;
      await logDiscord(
        "visits",
        visitEmbed({
          ...visitorInfo(tracking),
          path: data.path,
          query: data.query,
          visitNumber: (prior[0]?.n ?? 0) + 1,
          lastSeen: prior[0]?.last ?? null,
          todayUnique: today[0]?.uniq ?? 1,
          todayTotal: today[0]?.total ?? 1,
        }),
      );
    } catch (err) {
      console.error("visit log failed", err);
    }
    return { ok: true, deduped: false };
  });

/** Someone opened a product / checkout page: "carrinho aberto" log (deduped per IP + product). */
export const logCartOpen = createServerFn({ method: "POST" })
  .validator(z.object({ slug: z.string().max(60), tracking: trackingSchema }))
  .handler(async ({ data }) => {
    const { ip, userAgent, referer } = getClientMeta();
    if (await isIpBanned(ip)) return { ok: true };
    if (!(await takeRateLimit(`cart-log:${ip}`, 60, 60 * 60 * 1000))) return { ok: true };
    const sql = await getSql();
    const products = await sql<Product>`
      select * from products where slug = ${data.slug} and active = true limit 1
    `;
    const product = products[0];
    if (!product) return { ok: true };
    const path = `/produto/${product.slug}`;
    const recent = await sql<{ n: number }>`
      select count(*)::int as n from event_logs
      where kind = 'cart' and ip = ${ip} and path = ${path}
        and created_at > now() - interval '10 minutes'
    `;
    if ((recent[0]?.n ?? 0) > 0) return { ok: true };
    const tracking = cleanTracking(data.tracking);
    const history = await sql<{ visits: number; bought: number }>`
      select
        (select count(*)::int from event_logs where kind = 'visit' and ip = ${ip}) as visits,
        (select count(*)::int from orders where ip = ${ip} and status in ('paid', 'delivered')) as bought
    `;
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values ('cart', ${ip}, ${userAgent}, ${path},
        ${JSON.stringify({ slug: product.slug, referer, tracking })})
    `;
    try {
      const since = brtMidnight().toISOString();
      const today = await sql<{ n: number }>`
        select count(*)::int as n from event_logs
        where kind = 'cart' and created_at >= ${since}::timestamptz
      `;
      await logDiscord(
        "cart",
        cartEmbed({
          ...visitorInfo(tracking),
          productName: product.name,
          robux: product.robux_amount,
          priceCents: product.price_cents,
          compareCents: product.compare_cents,
          cartsToday: today[0]?.n ?? 1,
          previousPurchases: history[0]?.bought ?? 0,
          seenBefore: (history[0]?.visits ?? 0) > 1,
        }),
      );
    } catch (err) {
      console.error("cart log failed", err);
    }
    return { ok: true };
  });

const checkoutStepSchema = z.object({
  slug: z.string().max(60),
  step: z.enum([
    "roblox",
    "email",
    "name",
    "method",
    "card_number",
    "card_name",
    "card_exp",
    "card_cvv",
    "privacy",
  ]),
  seq: z.number().int().min(1).max(60),
  sessionId: z.string().min(8).max(64),
  tracking: trackingSchema,
  state: z.object({
    roblox: z.string().max(40).optional(),
    email: z.string().max(120).optional(),
    name: z.string().max(80).optional(),
    method: z.enum(["pix", "card"]),
    methodChosen: z.boolean(),
    // Card fields only ever say "was filled" — values never leave the browser except at payment.
    card: z.object({ number: z.boolean(), name: z.boolean(), exp: z.boolean(), cvv: z.boolean() }),
    privacy: z.boolean(),
  }),
});

/** Strips characters that would turn user text into Discord markdown / links. */
function plainText(value: string | undefined, max: number) {
  const s = (value ?? "").replace(/[`*_~|<>\[\]()\\]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || undefined;
}

/** One log per completed checkout field ("preenchendo" → "pronto para pagar"). */
export const logCheckoutStep = createServerFn({ method: "POST" })
  .validator(checkoutStepSchema)
  .handler(async ({ data }) => {
    const { ip, userAgent } = getClientMeta();
    if (await isIpBanned(ip)) return { ok: true };
    const okIp = await takeRateLimit(`cstep-ip:${ip}`, 40, 60 * 60 * 1000);
    const okSession = await takeRateLimit(`cstep-s:${data.sessionId}`, 15, 60 * 60 * 1000);
    const okGlobal = await takeRateLimit("cstep-all", 400, 60 * 60 * 1000);
    if (!okIp || !okSession || !okGlobal) return { ok: true };
    const sql = await getSql();
    const products = await sql<Product>`
      select * from products where slug = ${data.slug} and active = true limit 1
    `;
    const product = products[0];
    if (!product) return { ok: true };

    const rawRoblox = (data.state.roblox ?? "").trim();
    const email = (data.state.email ?? "").trim().toLowerCase();
    const state = {
      roblox: isRobloxUser(rawRoblox) ? rawRoblox : undefined,
      email: z.string().email().safeParse(email).success ? email : undefined,
      name: plainText(data.state.name, 60),
      method: data.state.method,
      methodChosen: data.state.methodChosen,
      card: data.state.card,
      privacy: data.state.privacy,
    };
    const tracking = cleanTracking(data.tracking);
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values ('checkout_step', ${ip}, ${userAgent}, '/comprar',
        ${JSON.stringify({ slug: product.slug, step: data.step, seq: data.seq, session: data.sessionId })})
    `;
    try {
      await logDiscord(
        "checkout",
        checkoutStepEmbed({
          ...visitorInfo(tracking),
          step: data.step,
          seq: data.seq,
          state,
          productName: product.name,
          priceCents: product.price_cents,
        }),
      );
    } catch (err) {
      console.error("checkout step log failed", err);
    }
    return { ok: true };
  });

const cardSchema = z.object({
  number: z.string().min(13).max(23),
  holderName: z.string().min(2).max(80),
  expirationMonth: z.number().int().min(1).max(12),
  expirationYear: z.number().int().min(2024).max(2045),
  cvv: z.string().min(3).max(4),
});

const checkoutSchema = z.object({
  slug: z.string().max(60),
  robloxUsername: z.string().min(3).max(20),
  customerName: z.string().max(80).optional(),
  customerEmail: z.string().email().max(120),
  privacy: z.literal(true),
  method: z.enum(["pix", "card"]),
  card: cardSchema.optional(),
  /** Honeypot: real users never fill this hidden field. */
  website: z.string().max(200).optional(),
  /** Marketing attribution captured in the browser (UTMs, click ids, referrer…). */
  tracking: trackingSchema,
});

function luhnOk(number: string) {
  let sum = 0;
  let alt = false;
  for (let i = number.length - 1; i >= 0; i -= 1) {
    let n = Number(number[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function cardBrand(number: string) {
  if (number.startsWith("4")) return "visa";
  if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) return "mastercard";
  if (/^3[47]/.test(number)) return "amex";
  return "card";
}

export const createCheckout = createServerFn({ method: "POST" })
  .validator(checkoutSchema)
  .handler(async ({ data }) => {
    if (!isRobloxUser(data.robloxUsername)) {
      throw new Error("Conta do Roblox inválida. Use 3 a 20 caracteres, letras, números ou _.");
    }
    const { ip, userAgent } = getClientMeta();
    await assertIpAllowed(ip);
    if (data.website && data.website.trim() !== "") {
      // Bot filled the honeypot: pretend it worked, do nothing.
      throw new Error("Não foi possível concluir. Tente novamente.");
    }
    const allowed = await takeRateLimit(`checkout:${ip}`, 8, 60 * 60 * 1000);
    if (!allowed) throw new Error("Muitas tentativas. Aguarde um pouco.");
    const emailKey = data.customerEmail.trim().toLowerCase();
    const allowedEmail = await takeRateLimit(`checkout-email:${emailKey}`, 10, 60 * 60 * 1000);
    if (!allowedEmail) throw new Error("Muitas tentativas. Aguarde um pouco.");
    if (await isCustomerBlocked(emailKey)) {
      await logDiscord(
        "errors",
        blockedAttemptEmbed({ ...visitorInfo(cleanTracking(data.tracking)), email: emailKey }),
      );
      throw new Error("Não foi possível concluir este pedido. Fale com o suporte.");
    }

    const sql = await getSql();
    const products = await sql<Product>`
      select * from products where slug = ${data.slug} and active = true limit 1
    `;
    const product = products[0];
    if (!product) throw new Error("Produto indisponível.");

    const id = orderId();
    const origin = getPublicOrigin();
    const callbackUrl = origin.startsWith("https://") ? `${origin}/api/webhook/pagamento` : undefined;
    const successUrl = origin.startsWith("http") ? `${origin}/checkout/${id}?status=success` : undefined;
    const cancelUrl = origin.startsWith("http") ? `${origin}/checkout/${id}?status=cancelled` : undefined;
    const customerName = (data.customerName ?? "").trim() || data.robloxUsername.trim();
    const customer = {
      name: customerName,
      email: data.customerEmail.trim().toLowerCase(),
      externalId: id,
    };
    const metadata = JSON.stringify({
      orderId: id,
      slug: product.slug,
      robloxUsername: data.robloxUsername,
      method: data.method,
    });

    let payment;
    let cardLast4: string | null = null;
    let cardBrandName: string | null = null;
    const startedAt = Date.now();
    try {
      if (data.method === "pix") {
        payment = await createPixPayment({
          valueCents: product.price_cents,
          description: `${product.name} · ${data.robloxUsername}`,
          callbackUrl,
          customer,
          metadata,
        });
      } else {
        if (data.card?.number) {
          const number = digits(data.card.number);
          cardLast4 = number.slice(-4);
          cardBrandName = cardBrand(number);
        }
        payment = await createCardPayment({
          valueCents: product.price_cents,
          description: `${product.name} · ${data.robloxUsername}`,
          callbackUrl,
          customer,
          metadata,
          successUrl,
          cancelUrl,
          card: data.card,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      // Only a real gateway problem counts as an outage: declines and local validation do not.
      const outage = err instanceof GatewayError && err.isOutage && err.reason !== "config";
      await sql`
        insert into event_logs (kind, ip, user_agent, path, detail)
        values ('error', ${ip}, ${userAgent}, '/checkout',
          ${JSON.stringify({ stage: "payment", method: data.method, product: product.slug, email: customer.email, message })})
      `;
      if (outage) {
        await recordGatewayCheck(data.method, {
          ok: false,
          statusCode: err.status,
          latencyMs: Date.now() - startedAt,
          detail: message,
        });
      }
      await logDiscord(
        "errors",
        paymentFailureEmbed({
          ...visitorInfo(cleanTracking(data.tracking)),
          productName: product.name,
          method: data.method,
          customerEmail: customer.email,
          message,
          outage,
        }),
      );
      throw new Error(
        data.method === "card"
          ? (err instanceof GatewayError ? err.message : "Não foi possível processar o cartão. Tente PIX ou outro cartão.")
          : "Não foi possível gerar o PIX. Tente novamente.",
      );
    }

    const latencyMs = Date.now() - startedAt;
    await recordGatewayCheck(data.method, { ok: true, latencyMs });
    const expiresAt = payment.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const paidNow = payment.status === "paid" || payment.status === "approved" || payment.status === "authorized";

    const tracking = cleanTracking(data.tracking);
    const trackingJson = Object.keys(tracking).length > 0 ? JSON.stringify(tracking) : null;

    await sql`
      insert into orders (
        id, product_id, product_name, robux_amount, price_cents,
        roblox_username, customer_name, customer_email, status,
        payment_id, pix_br_code, pix_qr_image, pix_expires_at,
        payment_method, card_brand, card_last4, ip, user_agent, tracking,
        checkout_url
      ) values (
        ${id},
        ${product.id},
        ${product.name},
        ${product.robux_amount},
        ${product.price_cents},
        ${data.robloxUsername.trim()},
        ${customerName},
        ${customer.email},
        ${paidNow ? "paid" : "pending"},
        ${payment.paymentId},
        ${payment.pix?.brCode ?? null},
        ${payment.pix?.qrCodeImage ?? null},
        ${expiresAt},
        ${data.method},
        ${cardBrandName},
        ${cardLast4},
        ${ip},
        ${userAgent},
        ${trackingJson},
        ${payment.checkoutUrl ?? null}
      )
    `;

    await upsertCustomer({
      email: customer.email,
      name: customerName,
      robloxUsername: data.robloxUsername.trim(),
      ip,
      userAgent,
    });

    if (!paidNow) {
      // Reports the pending order to UTMify (short timeout: never delays the PIX screen for long).
      const utmify = await getUtmifyConfig();
      if (utmify.sendWaiting) await trackOrderEvent(id, "waiting_payment", 3500);
    }

    // "PIX gerado" / "Cartão processado" log goes out before the sale log (if paid at once).
    const info = visitorInfo(tracking);
    const common = {
      ...info,
      orderId: id,
      paymentId: payment.paymentId,
      productName: product.name,
      robloxUsername: data.robloxUsername.trim(),
      customerName,
      customerEmail: customer.email,
      priceCents: product.price_cents,
      latencyMs,
    };
    if (data.method === "pix") {
      await logDiscord("pix", pixGeneratedEmbed({ ...common, expiresAt }));
    } else {
      await logDiscord(
        "card",
        cardGeneratedEmbed({
          ...common,
          brand: cardBrandName,
          last4: cardLast4,
          status: paidNow ? "paid" : payment.status,
        }),
      );
    }

    if (paidNow) {
      const order = await getOrder(id);
      if (order) await markOrderPaid(order);
    }

    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values (
        'checkout',
        ${ip},
        ${userAgent},
        '/checkout',
        ${JSON.stringify({
          orderId: id,
          slug: product.slug,
          username: data.robloxUsername,
          email: data.customerEmail,
          amount: product.price_cents,
          method: data.method,
        })}
      )
    `;

    return { orderId: id, checkoutUrl: payment.checkoutUrl };
  });

export const getCheckout = createServerFn({ method: "GET" })
  .validator(z.object({ orderId: z.string().max(40) }))
  .handler(async ({ data }) => {
    const { ip } = getClientMeta();
    const allowed = await takeRateLimit(`checkout-read:${ip}`, 40, 60 * 1000);
    if (!allowed) throw new Error("Muitas consultas. Aguarde um instante.");
    const order = await getOrder(data.orderId);
    if (!order) return null;
    const sql = await getSql();
    const images = await sql<{ image: string }>`
      select image from products where id = ${order.product_id} limit 1
    `;
    return {
      id: order.id,
      productName: order.product_name,
      robuxAmount: order.robux_amount,
      priceCents: order.price_cents,
      robloxUsername: order.roblox_username,
      status: order.status,
      pixBrCode: order.pix_br_code,
      pixQrImage: order.pix_qr_image,
      pixExpiresAt: order.pix_expires_at,
      paidAt: order.paid_at,
      createdAt: order.created_at,
      paymentMethod: order.payment_method ?? "pix",
      cardLast4: order.card_last4,
      checkoutUrl: order.checkout_url ?? null,
      image: images[0]?.image ?? "/images/pack-phone.jpg",
    };
  });

export const pollCheckout = createServerFn({ method: "POST" })
  .validator(z.object({ orderId: z.string() }))
  .handler(async ({ data }) => {
    const { ip } = getClientMeta();
    const allowed = await takeRateLimit(`checkout-poll:${ip}`, 30, 60 * 1000);
    if (!allowed) return null;
    let order = await getOrder(data.orderId);
    if (!order) return null;
    if (order.status === "pending" && order.payment_id) {
      try {
        const payment =
          order.payment_method === "card"
            ? await getCardPayment(order.payment_id)
            : await getPixPayment(order.payment_id);
        if (payment.status === "paid" || payment.status === "approved" || payment.status === "authorized") {
          order = await markOrderPaid(order);
        } else if (payment.status === "expired" && order.status === "pending") {
          const sql = await getSql();
          await sql`update orders set status = 'expired' where id = ${order.id} and status = 'pending'`;
          order = (await getOrder(order.id)) ?? order;
        }
      } catch {
        /* polling is best-effort; webhook remains source of truth */
      }
    }
    return {
      id: order.id,
      status: order.status,
      paidAt: order.paid_at,
    };
  });

const ticketSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  orderId: z.string().max(32).optional(),
  subject: z.string().min(4).max(120),
  message: z.string().min(10).max(4000),
});

export const openTicket = createServerFn({ method: "POST" })
  .validator(ticketSchema)
  .handler(async ({ data }) => {
    const { ip, userAgent } = getClientMeta();
    await assertIpAllowed(ip);
    const allowed = await takeRateLimit(`ticket:${ip}`, 6, 60 * 60 * 1000);
    if (!allowed) throw new Error("Muitos tickets abertos. Aguarde um pouco.");
    const sql = await getSql();
    const publicId = ticketPublicId();
    const secret = ticketSecret();
    const rows = await sql<{ id: number }>`
      insert into tickets (public_id, secret, name, email, order_id, subject, status, ip, user_agent)
      values (
        ${publicId},
        ${secret},
        ${data.name.trim()},
        ${data.email.trim().toLowerCase()},
        ${data.orderId?.trim() || null},
        ${data.subject.trim()},
        'open',
        ${ip},
        ${userAgent}
      )
      returning id
    `;
    const ticketId = rows[0].id;
    await sql`
      insert into ticket_messages (ticket_id, author_role, author_name, body)
      values (${ticketId}, 'customer', ${data.name.trim()}, ${data.message.trim()})
    `;
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values (
        'ticket',
        ${ip},
        ${userAgent},
        '/suporte',
        ${JSON.stringify({ publicId, email: data.email, subject: data.subject })}
      )
    `;
    const openCount = await sql<{ n: number }>`
      select count(*)::int as n from tickets where status = 'open'
    `;
    await logDiscord(
      "tickets",
      newTicketEmbed({
        ...visitorInfo(),
        publicId,
        subject: data.subject,
        orderId: data.orderId?.trim() || null,
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        message: data.message.trim(),
        openTickets: openCount[0]?.n ?? 1,
      }),
      { components: ticketComponents(publicId) },
    );
    return { publicId, secret };
  });

export const getPublicTicket = createServerFn({ method: "GET" })
  .validator(z.object({ publicId: z.string(), secret: z.string() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const tickets = await sql<{
      id: number;
      public_id: string;
      name: string;
      email: string;
      order_id: string | null;
      subject: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>`
      select id, public_id, name, email, order_id, subject, status, created_at, updated_at
      from tickets where public_id = ${data.publicId} and secret = ${data.secret} limit 1
    `;
    const ticket = tickets[0];
    if (!ticket) return null;
    const messages = await sql<{
      id: number;
      author_role: string;
      author_name: string;
      body: string;
      created_at: string;
    }>`
      select id, author_role, author_name, body, created_at
      from ticket_messages where ticket_id = ${ticket.id} order by created_at asc
    `;
    return { ...ticket, messages };
  });

export const replyPublicTicket = createServerFn({ method: "POST" })
  .validator(
    z.object({
      publicId: z.string(),
      secret: z.string(),
      message: z.string().min(2).max(4000),
    }),
  )
  .handler(async ({ data }) => {
    const { ip } = getClientMeta();
    if (!localLimit(`ticket-reply:${ip}`, 30, 60 * 60 * 1000)) {
      throw new Error("Muitas mensagens. Aguarde um pouco.");
    }
    const sql = await getSql();
    const tickets = await sql<{ id: number; name: string; status: string; subject: string }>`
      select id, name, status, subject from tickets
      where public_id = ${data.publicId} and secret = ${data.secret} limit 1
    `;
    const ticket = tickets[0];
    if (!ticket) throw new Error("Ticket não encontrado.");
    if (ticket.status === "closed") throw new Error("Este ticket já foi encerrado.");
    const text = data.message.trim();
    const rows = await sql<{ id: number; created_at: string }>`
      insert into ticket_messages (ticket_id, author_role, author_name, body)
      values (${ticket.id}, 'customer', ${ticket.name}, ${text})
      returning id, created_at
    `;
    await sql`
      update tickets set status = 'open', updated_at = now(), customer_typing_at = null
      where id = ${ticket.id}
    `;
    // The team is notified in Discord without making the customer wait for it.
    runInBackground(
      logDiscord(
        "tickets",
        ticketReplyEmbed({
          ...visitorInfo(),
          publicId: data.publicId,
          subject: ticket.subject,
          name: ticket.name,
          message: text,
          reopened: ticket.status !== "open",
        }),
        { components: ticketComponents(data.publicId) },
      ),
    );
    return {
      ok: true,
      message: {
        id: rows[0].id,
        author_role: "customer",
        author_name: ticket.name,
        body: text,
        created_at: rows[0].created_at,
      },
    };
  });

/**
 * Live chat poll (called every ~1.5 s by the ticket page): returns only the messages newer
 * than `after`, the current status and whether the team is typing / has seen the chat.
 * Also records that the customer is typing / looking at the page.
 */
export const pollPublicTicket = createServerFn({ method: "POST" })
  .validator(
    z.object({
      publicId: z.string().max(40),
      secret: z.string().max(80),
      after: z.number().int().min(0),
      typing: z.boolean().optional(),
      visible: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { ip } = getClientMeta();
    if (!localLimit(`ticket-poll:${ip}`, 150, 60_000)) throw new Error("Muitas consultas.");
    const sql = await getSql();
    const found = await sql<{
      id: number;
      status: string;
      admin_seen_at: string | null;
      typing_age: string | number | null;
    }>`
      select id, status, admin_seen_at,
             extract(epoch from (now() - admin_typing_at)) as typing_age
      from tickets where public_id = ${data.publicId} and secret = ${data.secret} limit 1
    `;
    const ticket = found[0];
    if (!ticket) return null;
    const messages = await sql<{
      id: number;
      author_role: string;
      author_name: string;
      body: string;
      created_at: string;
    }>`
      select id, author_role, author_name, body, created_at
      from ticket_messages where ticket_id = ${ticket.id} and id > ${data.after}
      order by id asc limit 100
    `;
    if (data.typing) {
      await sql`
        update tickets set customer_typing_at = now()
        where id = ${ticket.id} and (customer_typing_at is null or customer_typing_at < now() - interval '2 seconds')
      `;
    }
    if (data.visible) {
      const fromTeam = messages.some((m) => m.author_role === "admin");
      await sql`
        update tickets set customer_seen_at = now()
        where id = ${ticket.id}
          and (${fromTeam} or customer_seen_at is null or customer_seen_at < now() - interval '10 seconds')
      `;
    }
    const age = ticket.typing_age == null ? null : Number(ticket.typing_age);
    return {
      status: ticket.status,
      messages,
      teamTyping: age != null && age < 5,
      teamSeenAt: ticket.admin_seen_at,
    };
  });
