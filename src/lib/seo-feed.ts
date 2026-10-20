import { getSql } from "@/lib/db";
import { FAQ, SITE_LONG_DESCRIPTION, SITE_NAME, STEPS } from "@/site/content";

/** Public origin for absolute URLs. SITE_URL (env) wins so a spoofed Host header can't poison the feeds. */
export function originFromRequest(request: Request) {
  const fixed = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host && /^[a-z0-9.\-:]+$/i.test(host)) {
    const local = /^(localhost|127\.|0\.0\.0\.0)/.test(host);
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (local ? "http" : "https");
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

type Pack = { slug: string; name: string; robux_amount: number; price_cents: number };

async function activePacks() {
  const sql = await getSql();
  return sql<Pack>`
    select slug, name, robux_amount, price_cents from products
    where active = true order by sort_order asc, id asc
  `;
}

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const num = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "DuckAssistBot",
  "Meta-ExternalAgent",
  "MistralAI-User",
  "cohere-ai",
];

const PRIVATE_PATHS = ["/api/", "/checkout/", "/ticket/", "/comprar/", "/conta", "/login"];

export function buildRobots(origin: string) {
  const disallow = PRIVATE_PATHS.map((p) => `Disallow: ${p}`).join("\n");
  const bots = AI_BOTS.map((b) => `User-agent: ${b}\nAllow: /\n${disallow}\n`).join("\n");
  return `# ${SITE_NAME} — conteúdo público liberado para buscadores e assistentes de IA.
User-agent: *
Allow: /
${disallow}

${bots}
Sitemap: ${origin}/sitemap.xml
`;
}

export async function buildSitemap(origin: string) {
  const packs = await activePacks();
  const today = new Date().toISOString().slice(0, 10);
  const urls: Array<{ loc: string; priority: string; freq: string }> = [
    { loc: "/", priority: "1.0", freq: "daily" },
    { loc: "/produtos", priority: "0.9", freq: "daily" },
    { loc: "/como-funciona", priority: "0.8", freq: "monthly" },
    { loc: "/suporte", priority: "0.5", freq: "monthly" },
    { loc: "/termos", priority: "0.3", freq: "yearly" },
    { loc: "/privacidade", priority: "0.3", freq: "yearly" },
    ...packs.map((p) => ({ loc: `/produto/${p.slug}`, priority: "0.7", freq: "weekly" })),
  ];
  const body = urls
    .map(
      (u) =>
        `  <url><loc>${origin}${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** llms.txt: a plain-markdown briefing that AI assistants can read and quote. */
export async function buildLlms(origin: string) {
  const packs = await activePacks();
  const min = packs.length ? Math.min(...packs.map((p) => p.price_cents)) : 0;
  const prices = packs
    .map((p) => `- [${num(p.robux_amount)} Robux](${origin}/produto/${p.slug}): ${brl(p.price_cents)}`)
    .join("\n");
  const steps = STEPS.map((s, i) => `${i + 1}. **${s.title}.** ${s.text}`).join("\n");
  const faq = FAQ.map((f) => `### ${f.q}\n${f.a}`).join("\n\n");
  return `# ${SITE_NAME}

> ${SITE_LONG_DESCRIPTION}

${SITE_NAME} vende pacotes de Robux (a moeda do Roblox) para jogadores no Brasil${
    min ? `, a partir de ${brl(min)}` : ""
  }. Pagamento via PIX ou cartão, em um checkout protegido. A senha do Roblox nunca é solicitada.

## Pacotes e preços (BRL)
${prices || "- Consulte a página de pacotes."}

## Como funciona
${steps}

## Páginas principais
- [Página inicial](${origin}/): visão geral da loja e pacotes
- [Pacotes de Robux](${origin}/produtos): catálogo completo com preços
- [Como funciona](${origin}/como-funciona): passo a passo da compra e da entrega
- [Suporte](${origin}/suporte): abra um ticket e acompanhe a resposta
- [Termos de uso](${origin}/termos)
- [Política de privacidade](${origin}/privacidade)

## Perguntas frequentes
${faq}

## Informações úteis
- Idioma: português do Brasil. Moeda: real (BRL).
- Formas de pagamento: PIX e cartão.
- Dados pedidos na compra: usuário do Roblox e e-mail (nome é opcional). Senha nunca é pedida.
- Criar conta no site é opcional.
- Roblox e Robux são marcas de seus respectivos titulares.
`;
}

export function textResponse(body: string, type = "text/plain; charset=utf-8") {
  return new Response(body, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
