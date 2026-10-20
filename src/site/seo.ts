import { hasCardArt } from "@/site/card-art";
import { FAQ, SITE_LONG_DESCRIPTION, SITE_NAME, STEPS } from "@/site/content";
import type { Product } from "@/site/store-fn";

/** Escape for safe embedding inside <script type="application/ld+json">. */
export function ldString(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function homeJsonLd(origin: string, products: Product[]) {
  const orgId = `${origin}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: SITE_NAME,
        url: origin,
        logo: `${origin}/images/logo.png`,
        description: SITE_LONG_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        url: origin,
        name: SITE_NAME,
        inLanguage: "pt-BR",
        publisher: { "@id": orgId },
      },
      {
        "@type": "ItemList",
        name: "Pacotes de Robux",
        itemListElement: products.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: productJsonLd(origin, p),
        })),
      },
      faqJsonLd(),
    ],
  };
}

export function productJsonLd(origin: string, p: Product) {
  const amount = new Intl.NumberFormat("pt-BR").format(p.robux_amount);
  return {
    "@type": "Product",
    name: `${amount} Robux`,
    description: `Pacote de ${amount} Robux para a sua conta do Roblox. Pagamento no PIX ou cartão, entrega após a confirmação.`,
    ...(hasCardArt(p.robux_amount) ? { image: `${origin}/images/cards/${p.robux_amount}.jpg` } : {}),
    brand: { "@type": "Brand", name: SITE_NAME },
    offers: {
      "@type": "Offer",
      url: `${origin}/produto/${p.slug}`,
      priceCurrency: "BRL",
      price: (p.price_cents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: SITE_NAME },
    },
  };
}

export function faqJsonLd() {
  return {
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function howToJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Como comprar Robux na RecargasBuxs",
    description: "Passo a passo para comprar Robux e receber na sua conta do Roblox.",
    step: STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.text,
    })),
  };
}
