import { getSql } from "@/lib/db";
import { logDiscord } from "@/lib/discord";
import { saleEmbed } from "@/lib/discord-logs";
import { brtMidnight } from "@/lib/discord-report";
import { getSetting } from "@/lib/settings";
import { parseTracking } from "@/lib/tracking";

export type OrderRow = {
  id: string;
  product_id: number | null;
  product_name: string;
  robux_amount: number;
  price_cents: number;
  roblox_username: string;
  customer_name: string;
  customer_email: string;
  status: string;
  payment_id: string | null;
  pix_br_code: string | null;
  pix_qr_image: string | null;
  pix_expires_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  payer_name: string | null;
  payer_cpf: string | null;
  payer_bank: string | null;
  end_to_end_id: string | null;
  ip: string | null;
  user_agent: string | null;
  notes: string | null;
  created_at: string;
  payment_method?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
  tracking?: string | null;
  checkout_url?: string | null;
};

export async function getOrder(id: string) {
  const sql = await getSql();
  const rows = await sql<OrderRow>`select * from orders where id = ${id} limit 1`;
  return rows[0] ?? null;
}

export async function getOrderByPayment(paymentId: string) {
  const sql = await getSql();
  const rows = await sql<OrderRow>`
    select * from orders where payment_id = ${paymentId} or id = ${paymentId} limit 1
  `;
  return rows[0] ?? null;
}

export async function markOrderPaid(
  order: OrderRow,
  extra?: {
    payer_name?: string | null;
    payer_cpf?: string | null;
    payer_bank?: string | null;
    end_to_end_id?: string | null;
  },
) {
  if (order.status === "paid" || order.status === "delivered") return order;
  const auto = (await getSetting("auto_deliver")) !== "false";
  const next = auto ? "delivered" : "paid";
  const sql = await getSql();
  if (auto) {
    await sql`
      update orders set
        status = ${next},
        paid_at = now(),
        delivered_at = now(),
        payer_name = coalesce(${extra?.payer_name ?? null}, payer_name),
        payer_cpf = coalesce(${extra?.payer_cpf ?? null}, payer_cpf),
        payer_bank = coalesce(${extra?.payer_bank ?? null}, payer_bank),
        end_to_end_id = coalesce(${extra?.end_to_end_id ?? null}, end_to_end_id)
      where id = ${order.id} and status in ('pending', 'expired')
    `;
  } else {
    await sql`
      update orders set
        status = ${next},
        paid_at = now(),
        payer_name = coalesce(${extra?.payer_name ?? null}, payer_name),
        payer_cpf = coalesce(${extra?.payer_cpf ?? null}, payer_cpf),
        payer_bank = coalesce(${extra?.payer_bank ?? null}, payer_bank),
        end_to_end_id = coalesce(${extra?.end_to_end_id ?? null}, end_to_end_id)
      where id = ${order.id} and status in ('pending', 'expired')
    `;
  }
  await sql`
    update products set sold_count = sold_count + 1
    where id = ${order.product_id}
  `;
  await sql`
    insert into event_logs (kind, ip, user_agent, path, detail)
    values (
      'paid',
      ${order.ip},
      ${order.user_agent},
      '/checkout',
      ${JSON.stringify({
        orderId: order.id,
        username: order.roblox_username,
        amount: order.price_cents,
        payer: extra?.payer_name ?? null,
        method: order.payment_method ?? "pix",
      })}
    )
  `;
  try {
    const since = brtMidnight().toISOString();
    const email = order.customer_email.trim().toLowerCase();
    const [mine, today] = await Promise.all([
      sql<{ n: number; cents: number }>`
        select count(*)::int as n, coalesce(sum(price_cents), 0)::int as cents from orders
        where lower(customer_email) = ${email} and status in ('paid', 'delivered')
      `,
      sql<{ n: number; cents: number }>`
        select count(*)::int as n, coalesce(sum(price_cents), 0)::int as cents from orders
        where status in ('paid', 'delivered') and paid_at >= ${since}::timestamptz
      `,
    ]);
    await logDiscord(
      "paid",
      saleEmbed({
        ip: order.ip ?? "desconhecido",
        userAgent: order.user_agent ?? "",
        tracking: parseTracking(order.tracking),
        orderId: order.id,
        paymentId: order.payment_id,
        productName: order.product_name,
        robloxUsername: order.roblox_username,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        priceCents: order.price_cents,
        method: order.payment_method || "pix",
        cardBrand: order.card_brand,
        cardLast4: order.card_last4,
        autoDelivery: auto,
        payerName: extra?.payer_name ?? order.payer_name,
        payerCpf: extra?.payer_cpf ?? order.payer_cpf,
        payerBank: extra?.payer_bank ?? order.payer_bank,
        endToEndId: extra?.end_to_end_id ?? order.end_to_end_id,
        createdAt: order.created_at,
        purchaseNumber: mine[0]?.n ?? 1,
        lifetimeCents: mine[0]?.cents ?? order.price_cents,
        todaySales: today[0]?.n ?? 1,
        todayCents: today[0]?.cents ?? order.price_cents,
      }),
    );
  } catch (err) {
    console.error("sale log failed", err);
  }
  try {
    const { trackOrderEvent } = await import("@/lib/utmify");
    await trackOrderEvent(order.id, "paid");
  } catch (err) {
    console.error("utmify paid hook failed", err);
  }
  const updated = await getOrder(order.id);
  return updated ?? order;
}
