/**
 * Full store report for Discord (button "Solicitar relatório") and the panel.
 * Every number comes from the database; nothing is estimated or invented.
 */
import { getSql } from "@/lib/db";
import type { DiscordEmbed } from "@/lib/discord";
import {
  describeDevice,
  describeOrigin,
  money,
  num,
  pct,
  STATE_LABEL,
  when,
} from "@/lib/discord-logs";
import { getGatewayHealth } from "@/lib/gateway-health";
import { parseTracking } from "@/lib/tracking";

export type ReportPeriod = "today" | "7d" | "30d";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Brazil has no daylight saving since 2019, so BRT is a fixed UTC-3. */
const BRT = 3 * HOUR;

/** 00:00 (BRT) of the day that is `offsetDays` away from `date`. */
export function brtMidnight(date = new Date(), offsetDays = 0) {
  const shifted = new Date(date.getTime() - BRT);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + offsetDays, 3, 0, 0),
  );
}

export function periodRange(period: ReportPeriod, now = new Date()) {
  if (period === "today") {
    const since = brtMidnight(now);
    return {
      since,
      until: now,
      prevSince: new Date(since.getTime() - DAY),
      prevUntil: new Date(now.getTime() - DAY),
      label: "HOJE",
      prevLabel: "ontem (mesmo horário)",
    };
  }
  const days = period === "7d" ? 7 : 30;
  const since = new Date(now.getTime() - days * DAY);
  return {
    since,
    until: now,
    prevSince: new Date(since.getTime() - days * DAY),
    prevUntil: since,
    label: `ÚLTIMOS ${days} DIAS`,
    prevLabel: `${days} dias anteriores`,
  };
}

function delta(cur: number, prev: number) {
  if (!prev && !cur) return "—";
  if (!prev) return "🆕 sem base anterior";
  const change = ((cur - prev) / prev) * 100;
  if (Math.abs(change) < 0.5) return "➖ igual ao anterior";
  return `${change > 0 ? "🔼" : "🔽"} ${Math.abs(Math.round(change))}% vs anterior`;
}

type SqlFn = Awaited<ReturnType<typeof getSql>>;

async function totals(sql: SqlFn, from: Date, to: Date) {
  const a = from.toISOString();
  const b = to.toISOString();
  const [visits, carts, steps, generated, paid, open] = await Promise.all([
    sql<{ total: number; uniq: number }>`
      select count(*)::int as total, count(distinct ip)::int as uniq from event_logs
      where kind = 'visit' and created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz`,
    sql<{ total: number; uniq: number }>`
      select count(*)::int as total, count(distinct ip)::int as uniq from event_logs
      where kind = 'cart' and created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz`,
    sql<{ total: number; uniq: number }>`
      select count(*)::int as total, count(distinct ip)::int as uniq from event_logs
      where kind = 'checkout_step' and created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz`,
    sql<{ method: string; n: number; paid_n: number }>`
      select coalesce(payment_method, 'pix') as method, count(*)::int as n,
             (count(*) filter (where status in ('paid', 'delivered')))::int as paid_n
      from orders where created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz
      group by 1`,
    sql<{ method: string; n: number; cents: number; robux: number }>`
      select coalesce(payment_method, 'pix') as method, count(*)::int as n,
             coalesce(sum(price_cents), 0)::int as cents, coalesce(sum(robux_amount), 0)::int as robux
      from orders
      where status in ('paid', 'delivered') and paid_at >= ${a}::timestamptz and paid_at < ${b}::timestamptz
      group by 1`,
    sql<{ status: string; n: number; cents: number }>`
      select status, count(*)::int as n, coalesce(sum(price_cents), 0)::int as cents
      from orders
      where status in ('pending', 'expired') and created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz
      group by status`,
  ]);
  const sumBy = (rows: Array<{ method: string; n: number }>, m: string) =>
    rows.find((r) => r.method === m)?.n ?? 0;
  const salesN = paid.reduce((s, r) => s + r.n, 0);
  const revenue = paid.reduce((s, r) => s + r.cents, 0);
  return {
    visitsTotal: visits[0]?.total ?? 0,
    visitors: visits[0]?.uniq ?? 0,
    carts: carts[0]?.total ?? 0,
    cartPeople: carts[0]?.uniq ?? 0,
    checkoutPeople: steps[0]?.uniq ?? 0,
    pixGenerated: sumBy(generated, "pix"),
    cardGenerated: sumBy(generated, "card"),
    pixPaid: generated.find((r) => r.method === "pix")?.paid_n ?? 0,
    cardPaid: generated.find((r) => r.method === "card")?.paid_n ?? 0,
    salesN,
    revenue,
    robux: paid.reduce((s, r) => s + r.robux, 0),
    pending: open.find((r) => r.status === "pending") ?? { n: 0, cents: 0 },
    expired: open.find((r) => r.status === "expired") ?? { n: 0, cents: 0 },
  };
}

function lines(items: string[], empty = "sem dados no período") {
  return items.length ? items.join("\n") : empty;
}

export async function buildReport(period: ReportPeriod, siteName = "RecargasBuxs"): Promise<DiscordEmbed[]> {
  const sql = await getSql();
  const r = periodRange(period);
  const a = r.since.toISOString();
  const b = r.until.toISOString();

  const [cur, prev, topProducts, visitRows, support, accounts, errors, feedbacks, waitingNow, health] =
    await Promise.all([
      totals(sql, r.since, r.until),
      totals(sql, r.prevSince, r.prevUntil),
      sql<{ name: string; n: number; cents: number }>`
        select product_name as name, count(*)::int as n, coalesce(sum(price_cents), 0)::int as cents
        from orders
        where status in ('paid', 'delivered') and paid_at >= ${a}::timestamptz and paid_at < ${b}::timestamptz
        group by product_name order by n desc, cents desc limit 5`,
      sql<{ ip: string | null; user_agent: string | null; detail: string | null }>`
        select ip, user_agent, detail from event_logs
        where kind = 'visit' and created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz
        order by created_at desc limit 4000`,
      sql<{ opened: number; open_now: number }>`
        select
          (select count(*) from tickets where created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz)::int as opened,
          (select count(*) from tickets where status in ('open', 'in_progress', 'waiting'))::int as open_now`,
      sql<{ customers: number; accounts: number }>`
        select
          (select count(*) from customers where created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz)::int as customers,
          (select count(*) from shop_users where created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz)::int as accounts`,
      sql<{ n: number }>`
        select count(*)::int as n from event_logs
        where kind in ('error', 'webhook_rejected') and created_at >= ${a}::timestamptz and created_at < ${b}::timestamptz`,
      sql<{ n: number }>`select count(*)::int as n from feedbacks where status = 'pending'`,
      sql<{ n: number; cents: number }>`
        select count(*)::int as n, coalesce(sum(price_cents), 0)::int as cents from orders
        where status = 'pending' and (pix_expires_at is null or pix_expires_at > now())`,
      getGatewayHealth(),
    ]);

  // Traffic sources and devices, counted per unique visitor (IP) so one person is not many.
  const sources = new Map<string, Set<string>>();
  const devices = new Map<string, Set<string>>();
  const seen = new Set<string>();
  for (const row of visitRows) {
    const ip = row.ip ?? "?";
    let referer = "";
    let tracking = {};
    try {
      const d = JSON.parse(row.detail ?? "{}") as { referer?: string; tracking?: unknown };
      referer = d.referer ?? "";
      tracking = parseTracking(JSON.stringify(d.tracking ?? {}));
    } catch {
      /* old rows may not be JSON */
    }
    const origin = describeOrigin({ referer, tracking });
    if (!sources.has(origin)) sources.set(origin, new Set());
    sources.get(origin)!.add(ip);
    if (!seen.has(ip)) {
      seen.add(ip);
      const kind = describeDevice(row.user_agent ?? "").kind;
      if (!devices.has(kind)) devices.set(kind, new Set());
      devices.get(kind)!.add(ip);
    }
  }
  const topSources = [...sources.entries()]
    .map(([name, set]) => [name, set.size] as const)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5);
  const uniqueTotal = seen.size || 1;
  const deviceIcon: Record<string, string> = { Desktop: "🖥️", Celular: "📱", Tablet: "📲" };
  const deviceLine = [...devices.entries()]
    .map(([kind, set]) => [kind, set.size] as const)
    .sort((x, y) => y[1] - x[1])
    .map(([kind, n]) => `${deviceIcon[kind] ?? "🔹"} ${kind} **${pct(n, uniqueTotal)}**`)
    .join("  ·  ");

  const avgTicket = cur.salesN ? Math.round(cur.revenue / cur.salesN) : 0;
  const generatedTotal = cur.pixGenerated + cur.cardGenerated;
  const pad = (s: string, n: number) => s.padEnd(n, " ");
  const step = (label: string, value: number, base?: number) =>
    `${pad(label, 14)} ${String(num(value)).padStart(6)}${base != null ? `  (${pct(Math.min(value, base || value), base || 1)})` : ""}`;
  const funnel = [
    step("Visitantes", cur.visitors),
    step("Carrinho", cur.cartPeople, cur.visitors),
    step("Checkout", cur.checkoutPeople, cur.cartPeople),
    step("Pagto gerado", generatedTotal, cur.checkoutPeople || cur.cartPeople),
    step("Pago", cur.salesN, generatedTotal),
  ].join("\n");

  const main: DiscordEmbed = {
    title: `📊 RELATÓRIO GERAL — ${r.label}`,
    color: 0xfacc15,
    description:
      `Período: ${when(r.since, "f")} → ${when(r.until, "f")}\n` +
      `Comparando com **${r.prevLabel}**.`,
    fields: [
      { name: "💰 Faturamento", value: `**${money(cur.revenue)}**\n${delta(cur.revenue, prev.revenue)}`, inline: true },
      { name: "🧾 Vendas pagas", value: `**${num(cur.salesN)}**\n${delta(cur.salesN, prev.salesN)}`, inline: true },
      { name: "🎫 Ticket médio", value: `**${money(avgTicket)}**\n🎮 ${num(cur.robux)} Robux`, inline: true },
      { name: "👥 Visitantes únicos", value: `**${num(cur.visitors)}**\n${delta(cur.visitors, prev.visitors)}`, inline: true },
      { name: "👁️ Visitas", value: `**${num(cur.visitsTotal)}**\n${delta(cur.visitsTotal, prev.visitsTotal)}`, inline: true },
      { name: "🛍️ Carrinhos abertos", value: `**${num(cur.carts)}**\n${num(cur.cartPeople)} pessoas`, inline: true },
      { name: "✍️ Checkouts iniciados", value: `**${num(cur.checkoutPeople)}** pessoas`, inline: true },
      {
        name: "💠 PIX gerados",
        value: `**${num(cur.pixGenerated)}**\n✅ ${num(cur.pixPaid)} pagos (${pct(cur.pixPaid, cur.pixGenerated)})`,
        inline: true,
      },
      {
        name: "💳 Cartões processados",
        value: `**${num(cur.cardGenerated)}**\n✅ ${num(cur.cardPaid)} aprovados (${pct(cur.cardPaid, cur.cardGenerated)})`,
        inline: true,
      },
      { name: "🔻 Funil de conversão", value: `\`\`\`\n${funnel}\n\`\`\`\n📈 Conversão geral: **${pct(cur.salesN, cur.visitors)}** dos visitantes compraram` },
      {
        name: "⏳ Aguardando pagamento agora",
        value: `**${num(waitingNow[0]?.n ?? 0)}** · ${money(waitingNow[0]?.cents ?? 0)}`,
        inline: true,
      },
      {
        name: "⌛ Expirados no período",
        value: `**${num(cur.expired.n)}** · ${money(cur.expired.cents)}`,
        inline: true,
      },
    ],
    footer: { text: `${siteName} · Relatório sob demanda` },
  };

  const second: DiscordEmbed = {
    title: "🧭 Origens, produtos e operação",
    color: 0xfacc15,
    fields: [
      {
        name: "🏆 Top pacotes vendidos",
        value: lines(
          topProducts.map(
            (p, i) => `**${i + 1}.** ${p.name} — ${num(p.n)} venda${p.n > 1 ? "s" : ""} · ${money(p.cents)}`,
          ),
          "nenhuma venda no período",
        ),
      },
      {
        name: "🌍 Origem dos visitantes",
        value: lines(
          topSources.map(([name, n]) => `• **${name}** — ${num(n)} (${pct(n, uniqueTotal)})`),
          "sem visitas no período",
        ),
        inline: true,
      },
      { name: "📱 Dispositivos", value: deviceLine || "sem dados", inline: true },
      {
        name: "🎧 Suporte",
        value: `**${num(support[0]?.opened ?? 0)}** novos tickets\n**${num(support[0]?.open_now ?? 0)}** abertos agora`,
        inline: true,
      },
      {
        name: "👤 Clientes",
        value: `**${num(accounts[0]?.customers ?? 0)}** novos clientes\n**${num(accounts[0]?.accounts ?? 0)}** contas criadas`,
        inline: true,
      },
      {
        name: "⭐ Feedbacks",
        value: `**${num(feedbacks[0]?.n ?? 0)}** aguardando aprovação`,
        inline: true,
      },
      { name: "🚨 Erros e bloqueios", value: `**${num(errors[0]?.n ?? 0)}** no período`, inline: true },
      {
        name: "⚙️ Gateway agora",
        value: `💠 PIX: ${STATE_LABEL[health.pix.status]}\n💳 Cartão: ${STATE_LABEL[health.card.status]}`,
      },
    ],
    footer: { text: `${siteName} · Gerado ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` },
  };

  return [main, second];
}
