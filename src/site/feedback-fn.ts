import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { logDiscord } from "@/lib/discord";
import { takeRateLimit } from "@/lib/rate-limit";
import { getClientMeta } from "@/lib/request-meta";
import { assertIpAllowed } from "@/lib/ip-ban";

export type PublicFeedback = {
  id: number;
  name: string;
  rating: number;
  message: string;
  robux_amount: number | null;
  created_at: string;
};

/** Approved feedback for the rolling band (only real entries, newest first). */
export const listFeedbacks = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const items = await sql<PublicFeedback>`
    select id, name, rating, message, robux_amount, created_at
    from feedbacks
    where status = 'approved'
    order by created_at desc, id desc
    limit 40
  `;
  const stats = await sql<{ n: number; avg: number | null }>`
    select count(*)::int as n, avg(rating)::float as avg
    from feedbacks where status = 'approved'
  `;
  return { items, count: stats[0]?.n ?? 0, average: stats[0]?.avg ?? null };
});

function firstName(value: string) {
  const token = value.trim().split(/\s+/)[0] ?? "";
  const clean = token.replace(/[^\p{L}\p{N}'’-]/gu, "").slice(0, 24);
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * A customer rates a PAID order. One per order; it waits for the owner's
 * approval in the admin before it appears on the site.
 */
export const submitFeedback = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderId: z.string().max(40),
      rating: z.number().int().min(1).max(5),
      message: z.string().trim().min(8, "Escreva um pouco mais.").max(280),
      name: z.string().max(60).optional(),
      /** Honeypot. */
      website: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { ip } = getClientMeta();
    await assertIpAllowed(ip);
    if (data.website && data.website.trim() !== "") throw new Error("Não foi possível enviar agora.");
    const allowed = await takeRateLimit(`feedback:${ip}`, 5, 60 * 60 * 1000);
    if (!allowed) throw new Error("Muitos envios. Aguarde um pouco.");

    const sql = await getSql();
    const orders = await sql<{
      id: string;
      status: string;
      customer_name: string | null;
      robux_amount: number;
    }>`
      select id, status, customer_name, robux_amount from orders where id = ${data.orderId} limit 1
    `;
    const order = orders[0];
    if (!order) throw new Error("Pedido não encontrado.");
    if (order.status !== "paid" && order.status !== "delivered") {
      throw new Error("O feedback fica disponível depois da confirmação do pagamento.");
    }
    const existing = await sql<{ id: number }>`select id from feedbacks where order_id = ${order.id} limit 1`;
    if (existing.length > 0) throw new Error("Você já enviou o feedback deste pedido. Obrigado!");

    const name = firstName(data.name ?? "") || firstName(order.customer_name ?? "") || "Cliente";
    const message = data.message.replace(/\s+/g, " ").trim();
    await sql`
      insert into feedbacks (name, rating, message, robux_amount, source, status, order_id)
      values (${name}, ${data.rating}, ${message}, ${order.robux_amount}, 'customer', 'pending', ${order.id})
    `;
    const pending = await sql<{ n: number }>`select count(*)::int as n from feedbacks where status = 'pending'`;
    await logDiscord("tickets", {
      title: "⭐ NOVO FEEDBACK DE CLIENTE",
      description: "Aguardando aprovação no painel (Feedbacks).",
      fields: [
        { name: "🧾 Pedido", value: `\`${order.id}\``, inline: true },
        {
          name: "⭐ Nota",
          value: `${"★".repeat(data.rating)}${"☆".repeat(Math.max(0, 5 - data.rating))} · ${data.rating}/5`,
          inline: true,
        },
        { name: "🎮 Robux", value: String(order.robux_amount), inline: true },
        { name: "🙋 Nome", value: name, inline: true },
        { name: "⏳ Pendentes", value: `**${pending[0]?.n ?? 1}**`, inline: true },
        { name: "💬 Mensagem", value: message.slice(0, 900) },
      ],
    });
    return { ok: true };
  });

/** Has this order already sent its feedback? (hides the form after sending) */
export const hasOrderFeedback = createServerFn({ method: "GET" })
  .validator(z.object({ orderId: z.string().max(40) }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`select id from feedbacks where order_id = ${data.orderId} limit 1`;
    return rows.length > 0;
  });
