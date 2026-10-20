/**
 * Discord log embeds: one builder per log type, all with the same visual language
 * (emoji labels, 3-column rows, Discord-native timestamps, color per type).
 *
 * Pure functions: no database, no network. Data comes in, an embed comes out, so
 * every layout can be checked offline (see `sampleEmbeds`).
 * SECURITY: nothing here ever receives or prints full card numbers, CVV or expiry.
 */
import type { DiscordComponents, DiscordEmbed, LogKind } from "@/lib/discord";
import { hostOf, type TrackingData } from "@/lib/tracking";
import { parseUa } from "@/lib/ua";

// ───────────────────────────── formatting helpers ─────────────────────────────

export function money(cents: number) {
  const value = Math.round(Number(cents) || 0) / 100;
  const [int, dec] = value.toFixed(2).split(".");
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

export function num(n: number) {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function code(value: string | number | null | undefined, fallback = "—") {
  const s = String(value ?? "").replace(/`/g, "'").trim();
  return s ? `\`${s.slice(0, 200)}\`` : fallback;
}

/** Discord renders `<t:…>` in each reader's own timezone. */
export function when(date: Date | string | number, style: "f" | "F" | "R" | "t" | "d" = "f") {
  const ms = date instanceof Date ? date.getTime() : new Date(date).getTime();
  return `<t:${Math.floor((Number.isFinite(ms) ? ms : Date.now()) / 1000)}:${style}>`;
}

export function ordinal(n: number) {
  return `${n}ª`;
}

export function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")} min`;
}

export function bar(done: number, total: number, width = 10) {
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  return `${"▰".repeat(filled)}${"▱".repeat(Math.max(0, width - filled))}`;
}

export function pct(part: number, whole: number) {
  if (!whole) return "0%";
  const v = (part / whole) * 100;
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}%`;
}

export function flagEmoji(country: string) {
  if (!/^[A-Z]{2}$/.test(country)) return "";
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function maskCpf(cpf: string | null | undefined) {
  const d = String(cpf ?? "").replace(/\D/g, "");
  if (d.length === 11) return `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••`;
  return cpf ? String(cpf).replace(/\d(?=\d{2})/g, "•") : "";
}

// ──────────────────────────────── visitor info ────────────────────────────────

export type VisitorInfo = {
  ip: string;
  userAgent: string;
  referer?: string;
  geo?: { country: string; city: string; region: string; language: string };
  tracking?: TrackingData;
};

export function describeDevice(userAgent: string) {
  const ua = parseUa(userAgent);
  const kind = ua.device === "Computador" ? "Desktop" : ua.device;
  const icon = ua.device === "Celular" ? "📱" : ua.device === "Tablet" ? "📲" : "🖥️";
  return {
    platform: `${icon} ${kind} • ${ua.browser}`,
    device: `${kind} · ${ua.os}`,
    kind,
    os: ua.os,
    browser: ua.browser,
  };
}

const AD_NETWORKS: Array<[keyof TrackingData, string]> = [
  ["fbclid", "Meta Ads"],
  ["gclid", "Google Ads"],
  ["ttclid", "TikTok Ads"],
  ["msclkid", "Bing Ads"],
  ["kwai_click_id", "Kwai Ads"],
];

export function describeOrigin(v: Pick<VisitorInfo, "referer" | "tracking">) {
  const t = v.tracking ?? {};
  const network = AD_NETWORKS.find(([key]) => t[key])?.[1];
  const base = t.utm_source
    ? `${t.utm_source}${t.utm_medium ? ` / ${t.utm_medium}` : ""}`
    : hostOf(v.referer) || hostOf(t.referrer) || "direto";
  return network && !base.toLowerCase().includes(network.split(" ")[0].toLowerCase())
    ? `${base} · ${network}`
    : base;
}

export function describeCampaign(tracking?: TrackingData) {
  const t = tracking ?? {};
  const parts = [t.utm_campaign, t.utm_content, t.utm_term].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : "—";
}

export function describeLocation(geo?: VisitorInfo["geo"]) {
  if (!geo || (!geo.city && !geo.country)) return "não informada";
  const place = [geo.city, geo.region].filter(Boolean).join(", ");
  return `${flagEmoji(geo.country)} ${place || geo.country}`.trim();
}

function describeLocale(v: VisitorInfo) {
  const t = v.tracking ?? {};
  const parts = [t.language || v.geo?.language, t.tz, t.screen].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : "—";
}

type Field = { name: string; value: string; inline?: boolean };

function visitorFields(v: VisitorInfo): { platform: Field; ip: Field; origin: Field; location: Field } {
  const d = describeDevice(v.userAgent);
  return {
    platform: { name: "🌐 Plataforma", value: d.platform, inline: true },
    ip: { name: "🔌 IP", value: code(v.ip), inline: true },
    origin: { name: "🔗 Origem", value: describeOrigin(v), inline: true },
    location: { name: "📍 Localização", value: describeLocation(v.geo), inline: true },
  };
}

// ───────────────────────────────── 1. visit ───────────────────────────────────

export function visitEmbed(
  i: VisitorInfo & {
    path: string;
    query?: string;
    visitNumber: number;
    lastSeen?: Date | string | null;
    todayUnique: number;
    todayTotal: number;
    at?: Date;
  },
): DiscordEmbed {
  const f = visitorFields(i);
  const d = describeDevice(i.userAgent);
  const returning = i.visitNumber > 1;
  return {
    title: "👁️ VISITA",
    description: returning
      ? `Visitante **recorrente** voltou ao site.`
      : `Novo visitante chegou ao site.`,
    fields: [
      f.platform,
      { name: "🖥️ Dispositivo", value: d.device, inline: true },
      f.location,
      f.ip,
      { name: "📄 Página", value: code(i.path + (i.query ? `?${i.query.slice(0, 80)}` : "")), inline: true },
      f.origin,
      { name: "🎯 Campanha", value: describeCampaign(i.tracking), inline: true },
      {
        name: "📅 Status",
        value: returning ? `🔁 Retorno · ${ordinal(i.visitNumber)} visita` : "✨ Novo",
        inline: true,
      },
      {
        name: "🕘 Último acesso",
        value: returning && i.lastSeen ? when(i.lastSeen, "R") : "primeira vez",
        inline: true,
      },
      { name: "🗣️ Idioma · fuso · tela", value: describeLocale(i) },
      {
        name: "📈 Hoje no site",
        value: `**${num(i.todayUnique)}** visitantes únicos · **${num(i.todayTotal)}** visitas`,
        inline: true,
      },
      { name: "⏰ Horário", value: when(i.at ?? new Date(), "f"), inline: true },
    ],
  };
}

// ───────────────────────────────── 2. cart ────────────────────────────────────

export function cartEmbed(
  i: VisitorInfo & {
    productName: string;
    robux: number;
    priceCents: number;
    compareCents?: number | null;
    cartsToday: number;
    previousPurchases: number;
    seenBefore: boolean;
    at?: Date;
  },
): DiscordEmbed {
  const f = visitorFields(i);
  const old = i.compareCents && i.compareCents > i.priceCents ? ` ~~${money(i.compareCents)}~~` : "";
  const status =
    i.previousPurchases > 0
      ? `💎 Cliente recorrente · ${i.previousPurchases} compra${i.previousPurchases > 1 ? "s" : ""}`
      : i.seenBefore
        ? "🔁 Já visitou antes"
        : "✨ Novo visitante";
  return {
    title: "🛍️ CARRINHO ABERTO",
    description: `Alguém clicou em **${i.productName}** e está olhando o pacote.`,
    fields: [
      { name: "🛍️ Produto", value: i.productName, inline: true },
      { name: "💵 Valor", value: `${money(i.priceCents)}${old}`, inline: true },
      { name: "🎮 Robux", value: num(i.robux), inline: true },
      f.platform,
      f.location,
      f.ip,
      f.origin,
      { name: "📅 Status", value: status, inline: true },
      { name: "🛒 Carrinhos hoje", value: `**${num(i.cartsToday)}**`, inline: true },
      { name: "⏰ Horário", value: when(i.at ?? new Date(), "f") },
    ],
  };
}

// ────────────────────────────── 3. checkout step ──────────────────────────────

export type CheckoutStepName =
  | "roblox"
  | "email"
  | "name"
  | "method"
  | "card_number"
  | "card_name"
  | "card_exp"
  | "card_cvv"
  | "privacy";

export type CheckoutState = {
  roblox?: string;
  email?: string;
  name?: string;
  method: "pix" | "card";
  methodChosen: boolean;
  card: { number: boolean; name: boolean; exp: boolean; cvv: boolean };
  privacy: boolean;
};

const STEP_LABEL: Record<CheckoutStepName, string> = {
  roblox: "🎮 Conta Roblox preenchida",
  email: "📧 E-mail preenchido",
  name: "🙋 Nome preenchido",
  method: "💠 Forma de pagamento escolhida",
  card_number: "💳 Número do cartão preenchido",
  card_name: "💳 Nome no cartão preenchido",
  card_exp: "💳 Validade do cartão preenchida",
  card_cvv: "💳 CVV preenchido",
  privacy: "✅ Termos aceitos",
};

export function checkoutProgress(state: CheckoutState) {
  const cardDone = state.card.number && state.card.name && state.card.exp && state.card.cvv;
  const items: Array<[string, boolean]> = [
    ["Conta Roblox", Boolean(state.roblox)],
    ["E-mail", Boolean(state.email)],
    ["Pagamento", state.methodChosen],
  ];
  if (state.method === "card") items.push(["Cartão", cardDone]);
  items.push(["Termos", state.privacy]);
  const done = items.filter(([, ok]) => ok).length;
  return { items, done, total: items.length };
}

export function checkoutStepEmbed(
  i: VisitorInfo & {
    step: CheckoutStepName;
    seq: number;
    state: CheckoutState;
    productName: string;
    priceCents: number;
    at?: Date;
  },
): DiscordEmbed {
  const f = visitorFields(i);
  const p = checkoutProgress(i.state);
  const isCard = i.step.startsWith("card_");
  // Card fields never carry their value — only the fact that they were filled.
  const value =
    i.step === "roblox" && i.state.roblox
      ? `\`@${i.state.roblox}\``
      : i.step === "email" && i.state.email
        ? `\`${i.state.email}\``
        : i.step === "name" && i.state.name
          ? i.state.name
          : i.step === "method"
            ? i.state.method === "pix"
              ? "PIX"
              : "Cartão"
            : "";
  const stage = p.done >= p.total ? "pronto para pagar" : "preenchendo";
  return {
    title: "🛒 CHECKOUT",
    fields: [
      {
        name: "👤 Cliente",
        value: `${i.state.name?.trim() || "Sem nome"} • ${i.state.email || "—"}`,
      },
      {
        name: "🛍️ Produto",
        value: `${i.productName} [Roblox: ${i.state.roblox ? `@${i.state.roblox}` : "—"}]`,
      },
      { name: "💵 Valor", value: money(i.priceCents), inline: true },
      { name: "💳 Método", value: i.state.method === "pix" ? "💠 PIX" : "💳 Cartão", inline: true },
      { name: "📋 Etapa", value: stage, inline: true },
      {
        name: "✍️ Campo concluído",
        value: `${STEP_LABEL[i.step]}${value ? ` → ${value}` : ""}${isCard ? " · 🔒 dado protegido, não registrado" : ""}`,
      },
      {
        name: `📊 Progresso · ${p.done}/${p.total}`,
        value: `${bar(p.done, p.total)}\n${p.items.map(([label, ok]) => `${ok ? "✅" : "⬜"} ${label}`).join("  ·  ")}`,
      },
      { name: "🔄 Status", value: i.seq <= 1 ? "🆕 Iniciado" : "🔄 Atualizado", inline: true },
      f.platform,
      f.ip,
      f.location,
      f.origin,
      { name: "⏰ Horário", value: when(i.at ?? new Date(), "t"), inline: true },
    ],
  };
}

// ──────────────────────────── 4. PIX / card generated ─────────────────────────

type OrderCommon = VisitorInfo & {
  orderId: string;
  paymentId: string | null | undefined;
  productName: string;
  robloxUsername: string;
  customerName: string;
  customerEmail: string;
  priceCents: number;
  latencyMs?: number;
  at?: Date;
};

function customerFields(i: OrderCommon): Field[] {
  return [
    { name: "👤 Cliente", value: `${i.customerName || "Sem nome"} • ${i.customerEmail}` },
    { name: "🛍️ Produto", value: `${i.productName} [Roblox: @${i.robloxUsername}]` },
  ];
}

export function pixGeneratedEmbed(i: OrderCommon & { expiresAt?: Date | string | null }): DiscordEmbed {
  const f = visitorFields(i);
  return {
    title: "💠 PIX GERADO",
    description: `## ${money(i.priceCents)}\nO cliente recebeu o QR Code e o copia e cola.`,
    fields: [
      ...customerFields(i),
      { name: "💳 Método", value: "💠 PIX", inline: true },
      { name: "📋 Status", value: "⏳ Aguardando pagamento", inline: true },
      { name: "⏳ Expira", value: i.expiresAt ? when(i.expiresAt, "R") : "—", inline: true },
      { name: "🧾 Pedido", value: code(i.orderId), inline: true },
      { name: "🆔 Payment ID", value: code(i.paymentId), inline: true },
      {
        name: "⚡ Gerado em",
        value: i.latencyMs != null ? `${num(i.latencyMs)} ms` : "—",
        inline: true,
      },
      f.platform,
      f.location,
      f.ip,
      f.origin,
      { name: "🎯 Campanha", value: describeCampaign(i.tracking), inline: true },
      { name: "⏰ Horário", value: when(i.at ?? new Date(), "f"), inline: true },
    ],
  };
}

const CARD_STATUS: Record<string, string> = {
  paid: "✅ Aprovado",
  approved: "✅ Aprovado",
  authorized: "✅ Autorizado",
  pending: "⏳ Em análise",
  processing: "⏳ Em análise",
};

export function cardGeneratedEmbed(
  i: OrderCommon & { brand?: string | null; last4?: string | null; status: string },
): DiscordEmbed {
  const f = visitorFields(i);
  const approved = ["paid", "approved", "authorized"].includes(i.status);
  return {
    title: "💳 CARTÃO PROCESSADO",
    color: approved ? 0x22c55e : 0x818cf8,
    description: `## ${money(i.priceCents)}\nPagamento por cartão enviado ao gateway.`,
    fields: [
      ...customerFields(i),
      {
        name: "💳 Cartão",
        value: `${(i.brand || "cartão").toUpperCase()} •••• ${i.last4 || "????"}`,
        inline: true,
      },
      { name: "📋 Resultado", value: CARD_STATUS[i.status] ?? `⏳ ${i.status}`, inline: true },
      {
        name: "⚡ Processado em",
        value: i.latencyMs != null ? `${num(i.latencyMs)} ms` : "—",
        inline: true,
      },
      { name: "🧾 Pedido", value: code(i.orderId), inline: true },
      { name: "🆔 Payment ID", value: code(i.paymentId), inline: true },
      { name: "🔒 Segurança", value: "número completo e CVV nunca são salvos", inline: true },
      f.platform,
      f.location,
      f.ip,
      f.origin,
      { name: "🎯 Campanha", value: describeCampaign(i.tracking), inline: true },
      { name: "⏰ Horário", value: when(i.at ?? new Date(), "f"), inline: true },
    ],
  };
}

// ───────────────────────────────── 5. sale ────────────────────────────────────

export function saleEmbed(
  i: OrderCommon & {
    method: string;
    cardBrand?: string | null;
    cardLast4?: string | null;
    autoDelivery: boolean;
    payerName?: string | null;
    payerCpf?: string | null;
    payerBank?: string | null;
    endToEndId?: string | null;
    createdAt?: Date | string | null;
    purchaseNumber: number;
    lifetimeCents: number;
    todaySales: number;
    todayCents: number;
  },
): DiscordEmbed {
  const f = visitorFields(i);
  const paidAt = i.at ?? new Date();
  const ttp = i.createdAt ? paidAt.getTime() - new Date(i.createdAt).getTime() : null;
  const methodLabel =
    i.method === "card"
      ? `💳 Cartão ${(i.cardBrand || "").toUpperCase()} •••• ${i.cardLast4 || "????"}`.replace("  ", " ")
      : "💠 PIX";
  const payer = [i.payerName, i.payerBank].filter(Boolean).join(" · ");
  const cpf = maskCpf(i.payerCpf);
  const fields: Field[] = [
    ...customerFields(i),
    { name: "💳 Método", value: methodLabel, inline: true },
    {
      name: "🚚 Entrega",
      value: i.autoDelivery ? "⚡ Automática" : "⏳ Aguardando o painel",
      inline: true,
    },
    {
      name: "⏱️ Tempo até pagar",
      value: ttp != null && ttp >= 0 ? duration(ttp) : "—",
      inline: true,
    },
    { name: "🆔 Payment ID", value: code(i.paymentId), inline: true },
    { name: "🧾 Pedido", value: code(i.orderId), inline: true },
    { name: "🔑 End-to-end", value: code(i.endToEndId), inline: true },
  ];
  if (payer || cpf) {
    fields.push({ name: "🏦 Pagador", value: [payer, cpf && `CPF ${cpf}`].filter(Boolean).join("\n") || "—" });
  }
  fields.push(
    {
      name: "🔁 Histórico do cliente",
      value:
        i.purchaseNumber > 1
          ? `💎 ${ordinal(i.purchaseNumber)} compra · total gasto **${money(i.lifetimeCents)}**`
          : "🆕 Primeira compra",
      inline: true,
    },
    {
      name: "📈 Vendas hoje",
      value: `**${num(i.todaySales)}** · ${money(i.todayCents)}`,
      inline: true,
    },
    f.origin,
    f.platform,
    f.location,
    f.ip,
    { name: "⏰ Pago em", value: when(paidAt, "f") },
  );
  return {
    title: "✅ PAGO · 💰 VENDA CONFIRMADA!",
    description: `## ${money(i.priceCents)}`,
    fields,
  };
}

// ───────────────────────────── 6. gateway status ──────────────────────────────

export type GatewayState = "online" | "unstable" | "offline" | "unknown";

export type MethodHealth = {
  status: GatewayState;
  lastOkAt: string | null;
  lastFailAt: string | null;
  lastDetail: string | null;
  lastLatencyMs: number | null;
  ok24h: number;
  fail24h: number;
};

export type GatewayHealth = { pix: MethodHealth; card: MethodHealth };

export const STATE_LABEL: Record<GatewayState, string> = {
  online: "🟢 ONLINE",
  unstable: "🟡 INSTÁVEL",
  offline: "🔴 OFFLINE",
  unknown: "⚪ SEM DADOS RECENTES",
};

const STATE_COLOR: Record<GatewayState, number> = {
  online: 0x22c55e,
  unstable: 0xf59e0b,
  offline: 0xef4444,
  unknown: 0x94a3b8,
};

function worst(a: GatewayState, b: GatewayState): GatewayState {
  const order: GatewayState[] = ["offline", "unstable", "unknown", "online"];
  return order.find((s) => s === a || s === b) ?? "unknown";
}

function methodDetail(h: MethodHealth) {
  const total = h.ok24h + h.fail24h;
  const lines = [
    h.lastLatencyMs != null ? `⚡ ${num(h.lastLatencyMs)} ms na última chamada` : null,
    total ? `📈 ${pct(h.ok24h, total)} de sucesso em 24h (${num(h.ok24h)}/${num(total)})` : "📈 nenhuma tentativa em 24h",
    h.lastOkAt ? `✅ último sucesso ${when(h.lastOkAt, "R")}` : null,
    h.lastFailAt ? `❌ última falha ${when(h.lastFailAt, "R")}` : null,
    h.status !== "online" && h.lastDetail ? `📝 ${h.lastDetail.slice(0, 160)}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export function gatewayStatusEmbed(
  health: GatewayHealth,
  opts?: { alert?: { method: "pix" | "card"; down: boolean }; checkedAt?: Date },
): DiscordEmbed {
  const overall = worst(health.pix.status, health.card.status);
  const alert = opts?.alert;
  const name = alert ? (alert.method === "pix" ? "GERADOR PIX" : "PAGAMENTO POR CARTÃO") : null;
  return {
    title: alert
      ? alert.down
        ? `🚨 ${name} FORA DO AR`
        : `✅ ${name} VOLTOU AO NORMAL`
      : "⚙️ GATEWAY STATUS",
    color: STATE_COLOR[overall],
    description: alert
      ? alert.down
        ? "Falhas seguidas ao falar com o gateway. **Clientes podem não conseguir pagar.** Veja o detalhe abaixo."
        : "O gateway voltou a responder. Pagamentos normalizados."
      : undefined,
    fields: [
      { name: "💠 Status Gerador PIX", value: STATE_LABEL[health.pix.status], inline: true },
      { name: "💳 Status Pagto Cartão", value: STATE_LABEL[health.card.status], inline: true },
      { name: "🕒 Verificado", value: when(opts?.checkedAt ?? new Date(), "R"), inline: true },
      { name: "💠 Detalhes PIX", value: methodDetail(health.pix) || "—", inline: true },
      { name: "💳 Detalhes Cartão", value: methodDetail(health.card) || "—", inline: true },
    ],
  };
}

// ─────────────────────────── 7. report panel (buttons) ────────────────────────

export const REPORT_PANEL_ID = {
  today: "rb:report:today",
  week: "rb:report:7d",
  month: "rb:report:30d",
  gateway: "rb:gateway",
} as const;

export function reportPanelEmbed(siteName: string): DiscordEmbed {
  return {
    title: "📊 PAINEL DE RELATÓRIOS",
    color: 0xfacc15,
    description:
      `Relatório completo da **${siteName}** sob demanda.\n` +
      "Clique em um botão e o bot envia aqui, na hora, o resumo de **entradas, carrinhos, checkouts, PIX/cartão gerados, vendas, faturamento, origens e suporte**.",
    fields: [
      { name: "📊 Solicitar relatório", value: "resumo de **hoje**", inline: true },
      { name: "📅 7 dias · 🗓️ 30 dias", value: "com comparação ao período anterior", inline: true },
      { name: "⚙️ Status dos pagamentos", value: "PIX e cartão online/offline", inline: true },
    ],
  };
}

export function reportPanelComponents(): DiscordComponents {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: "Solicitar relatório", emoji: { name: "📊" }, custom_id: REPORT_PANEL_ID.today },
        { type: 2, style: 1, label: "7 dias", emoji: { name: "📅" }, custom_id: REPORT_PANEL_ID.week },
        { type: 2, style: 1, label: "30 dias", emoji: { name: "🗓️" }, custom_id: REPORT_PANEL_ID.month },
        { type: 2, style: 2, label: "Status dos pagamentos", emoji: { name: "⚙️" }, custom_id: REPORT_PANEL_ID.gateway },
      ],
    },
  ];
}

// ───────────────────────────── 8. errors & others ─────────────────────────────

export function paymentFailureEmbed(
  i: VisitorInfo & {
    productName: string;
    method: "pix" | "card";
    customerEmail: string;
    message: string;
    outage: boolean;
  },
): DiscordEmbed {
  const f = visitorFields(i);
  return {
    title: i.outage ? "🚨 FALHA NO GATEWAY" : "⚠️ PAGAMENTO RECUSADO",
    description: i.outage
      ? "O gateway não respondeu como esperado. O cliente viu uma mensagem de erro."
      : "O gateway respondeu e recusou a operação (não é queda).",
    fields: [
      { name: "🛍️ Produto", value: i.productName, inline: true },
      { name: "💳 Método", value: i.method === "pix" ? "💠 PIX" : "💳 Cartão", inline: true },
      { name: "👤 Cliente", value: i.customerEmail, inline: true },
      { name: "📝 Motivo", value: code(i.message.slice(0, 300), "—") },
      f.platform,
      f.ip,
      f.location,
    ],
  };
}

export function blockedAttemptEmbed(i: VisitorInfo & { email: string }): DiscordEmbed {
  const f = visitorFields(i);
  return {
    title: "⛔ TENTATIVA DE CLIENTE BLOQUEADO",
    description: "Um cliente bloqueado tentou comprar de novo. O pedido foi barrado.",
    fields: [{ name: "👤 E-mail", value: code(i.email), inline: true }, f.ip, f.platform, f.location],
  };
}

export function newTicketEmbed(
  i: VisitorInfo & {
    publicId: string;
    subject: string;
    orderId?: string | null;
    name: string;
    email: string;
    message: string;
    openTickets: number;
  },
): DiscordEmbed {
  const f = visitorFields(i);
  return {
    title: "🎧 NOVO TICKET",
    description: `**${i.subject}**`,
    fields: [
      { name: "🎫 Código", value: code(i.publicId), inline: true },
      { name: "🧾 Pedido", value: code(i.orderId), inline: true },
      { name: "📬 Abertos agora", value: `**${num(i.openTickets)}**`, inline: true },
      { name: "👤 Cliente", value: `${i.name} • ${i.email}` },
      { name: "💬 Mensagem", value: i.message.slice(0, 600) },
      f.platform,
      f.ip,
      f.location,
    ],
  };
}
/** Buttons under each ticket message: answer it (opens a form) or close it, right from Discord. */
export const TICKET_ID = { reply: "rb:tk:reply:", close: "rb:tk:close:", modal: "rb:tk:modal:" } as const;

export function ticketComponents(publicId: string): DiscordComponents {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: "Responder", emoji: { name: "💬" }, custom_id: `${TICKET_ID.reply}${publicId}` },
        { type: 2, style: 2, label: "Encerrar", emoji: { name: "🔒" }, custom_id: `${TICKET_ID.close}${publicId}` },
      ],
    },
  ];
}

/** The customer wrote again in an existing ticket. */
export function ticketReplyEmbed(
  i: VisitorInfo & { publicId: string; subject: string; name: string; message: string; reopened: boolean },
): DiscordEmbed {
  const f = visitorFields(i);
  return {
    title: "💬 CLIENTE RESPONDEU NO TICKET",
    description: `**${i.subject}**`,
    fields: [
      { name: "🎫 Código", value: code(i.publicId), inline: true },
      { name: "🙋 Cliente", value: i.name, inline: true },
      { name: "📋 Status", value: i.reopened ? "🔓 Reaberto" : "📬 Aberto", inline: true },
      { name: "💬 Mensagem", value: i.message.slice(0, 900) },
      f.platform,
      f.ip,
      f.location,
    ],
  };
}

export function newAccountEmbed(i: VisitorInfo & { email: string; name: string; totalAccounts: number }): DiscordEmbed {
  const f = visitorFields(i);
  return {
    title: "👤 NOVA CONTA CRIADA",
    description: "Um cliente criou conta (login opcional) na loja.",
    fields: [
      { name: "🙋 Nome", value: i.name || "Sem nome", inline: true },
      { name: "📧 E-mail", value: code(i.email), inline: true },
      { name: "👥 Total de contas", value: `**${num(i.totalAccounts)}**`, inline: true },
      f.platform,
      f.ip,
      f.location,
      f.origin,
    ],
  };
}

export function newCustomerEmbed(i: { name: string; email: string; roblox: string; totalCustomers: number }): DiscordEmbed {
  return {
    title: "🧩 NOVO MÓDULO DE CLIENTE",
    description: "Um módulo de cliente foi criado automaticamente no primeiro checkout.",
    fields: [
      { name: "🙋 Nome", value: i.name || "Sem nome", inline: true },
      { name: "📧 E-mail", value: code(i.email), inline: true },
      { name: "🎮 Conta Roblox", value: code(`@${i.roblox}`), inline: true },
      { name: "👥 Clientes no total", value: `**${num(i.totalCustomers)}**`, inline: true },
      { name: "⏰ Horário", value: when(new Date(), "f"), inline: true },
    ],
  };
}

// ─────────────────────────────────── samples ──────────────────────────────────

const SAMPLE_VISITOR: VisitorInfo = {
  ip: "57.141.2.72",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  referer: "https://www.instagram.com/",
  geo: { country: "BR", city: "São Paulo", region: "SP", language: "pt-BR" },
  tracking: {
    utm_source: "instagram",
    utm_medium: "bio",
    utm_campaign: "robux-promo",
    language: "pt-BR",
    tz: "America/Sao_Paulo",
    screen: "1920x1080",
  },
};

const SAMPLE_ORDER: OrderCommon = {
  ...SAMPLE_VISITOR,
  orderId: "RB-EXEMPLO-001",
  paymentId: "psc_80bd7b9953861b3c3604cd7deca62800",
  productName: "Roblox 400 Robux",
  robloxUsername: "lucas07079y",
  customerName: "Cliente Exemplo",
  customerEmail: "cliente@exemplo.com",
  priceCents: 1700,
  latencyMs: 412,
};

const SAMPLE_METHOD: MethodHealth = {
  status: "online",
  lastOkAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  lastFailAt: null,
  lastDetail: null,
  lastLatencyMs: 412,
  ok24h: 38,
  fail24h: 0,
};

/** A realistic example of every log, used by the "Enviar exemplo" button in the panel. */
export function sampleEmbed(kind: LogKind, siteName = "RecargasBuxs"): DiscordEmbed[] {
  switch (kind) {
    case "visits":
      return [
        visitEmbed({
          ...SAMPLE_VISITOR,
          path: "/",
          visitNumber: 1,
          todayUnique: 23,
          todayTotal: 41,
        }),
      ];
    case "cart":
      return [
        cartEmbed({
          ...SAMPLE_VISITOR,
          productName: "Roblox 400 Robux",
          robux: 400,
          priceCents: 1700,
          compareCents: 2190,
          cartsToday: 7,
          previousPurchases: 0,
          seenBefore: false,
        }),
      ];
    case "checkout":
      return [
        checkoutStepEmbed({
          ...SAMPLE_VISITOR,
          step: "email",
          seq: 2,
          productName: "Roblox 400 Robux",
          priceCents: 1700,
          state: {
            roblox: "lucas07079y",
            email: "cliente@exemplo.com",
            method: "pix",
            methodChosen: false,
            card: { number: false, name: false, exp: false, cvv: false },
            privacy: false,
          },
        }),
      ];
    case "pix":
      return [pixGeneratedEmbed({ ...SAMPLE_ORDER, expiresAt: new Date(Date.now() + 30 * 60_000) })];
    case "card":
      return [cardGeneratedEmbed({ ...SAMPLE_ORDER, brand: "visa", last4: "4242", status: "approved" })];
    case "paid":
      return [
        saleEmbed({
          ...SAMPLE_ORDER,
          method: "pix",
          autoDelivery: true,
          payerName: "Fulano de Tal",
          payerBank: "Nubank",
          payerCpf: "12345678901",
          endToEndId: "E00038166202610040312abc",
          createdAt: new Date(Date.now() - 92_000),
          purchaseNumber: 3,
          lifetimeCents: 5100,
          todaySales: 5,
          todayCents: 8450,
        }),
      ];
    case "gateway":
      return [gatewayStatusEmbed({ pix: SAMPLE_METHOD, card: SAMPLE_METHOD })];
    case "errors":
      return [
        paymentFailureEmbed({
          ...SAMPLE_VISITOR,
          productName: "Roblox 400 Robux",
          method: "pix",
          customerEmail: "cliente@exemplo.com",
          message: "Gateway sem resposta (timeout).",
          outage: true,
        }),
      ];
    case "tickets":
      return [
        newTicketEmbed({
          ...SAMPLE_VISITOR,
          publicId: "TK-4821",
          subject: "Robux ainda não caiu",
          orderId: "RB-EXEMPLO-001",
          name: "Cliente Exemplo",
          email: "cliente@exemplo.com",
          message: "Paguei o PIX há 5 minutos e ainda não recebi os Robux.",
          openTickets: 3,
        }),
      ];
    case "customers":
      return [
        newCustomerEmbed({
          name: "Cliente Exemplo",
          email: "cliente@exemplo.com",
          roblox: "lucas07079y",
          totalCustomers: 128,
        }),
      ];
    case "audit":
      return [
        {
          title: "🛡️ AUDITORIA DO PAINEL",
          description: "**Painel · cliente.bloqueado**\n**cliente:** cliente@exemplo.com\n**motivo:** chargeback",
          fields: [{ name: "👮 Equipe", value: "owner · seu@email.com", inline: true }],
        },
      ];
    case "report":
      return [reportPanelEmbed(siteName)];
  }
}
