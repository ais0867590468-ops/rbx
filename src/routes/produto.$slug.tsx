import { createFileRoute, Link } from "@tanstack/react-router";
import { GiftCardFace } from "@/site/components/gift-card";
import { FeedbackMarquee } from "@/site/components/feedback-marquee";
import { PandaVideo } from "@/site/components/panda-video";
import { SiteShell } from "@/site/components/site-shell";
import { Button } from "@/components/ui/button";
import { getProductBySlug, getSiteOrigin } from "@/site/store-fn";
import { brl, fmtNum } from "@/lib/utils";
import { ldString, productJsonLd } from "@/site/seo";
import { useCartLog } from "@/site/use-cart-log";

export const Route = createFileRoute("/produto/$slug")({
  loader: async ({ params }) => {
    const [product, origin] = await Promise.all([
      getProductBySlug({ data: { slug: params.slug } }),
      getSiteOrigin(),
    ]);
    return { product, origin };
  },
  head: ({ loaderData }) => {
    const product = loaderData?.product;
    const origin = loaderData?.origin ?? "";
    if (!product) return { meta: [{ title: "Produto não encontrado | RecargasBuxs" }, { name: "robots", content: "noindex" }] };
    const amount = fmtNum(product.robux_amount);
    return {
      meta: [
        { title: `Comprar ${amount} Robux por ${brl(product.price_cents)} | RecargasBuxs` },
        {
          name: "description",
          content: `Compre ${amount} Robux por ${brl(product.price_cents)}. Pague no PIX ou cartão e receba na sua conta do Roblox, sem pedir senha.`,
        },
      ],
      links: origin ? [{ rel: "canonical", href: `${origin}/produto/${product.slug}` }] : [],
      scripts: origin
        ? [
            {
              type: "application/ld+json",
              children: ldString({ "@context": "https://schema.org", ...productJsonLd(origin, product) }),
            },
          ]
        : [],
    };
  },
  component: ProdutoPage,
});

function ProdutoPage() {
  const { product } = Route.useLoaderData();
  useCartLog(product?.slug);

  if (!product) {
    return (
      <SiteShell>
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold">Produto não encontrado</h1>
          <Button asChild className="mt-6">
            <Link to="/produtos">Voltar aos pacotes</Link>
          </Button>
        </main>
      </SiteShell>
    );
  }

  const off =
    product.compare_cents && product.compare_cents > product.price_cents
      ? Math.round((1 - product.price_cents / product.compare_cents) * 100)
      : 0;

  return (
    <SiteShell>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-8 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-start">
          <div className="overflow-hidden rounded-lg border border-accent/50 bg-ink">
            <GiftCardFace amount={product.robux_amount} className="mx-auto w-full" />
          </div>
          <div>
            <p className="text-xs text-muted">
              <span className="font-semibold text-fg">{fmtNum(product.sold_count)}</span> vendidos
            </p>
            <h1 className="mt-1 font-sans text-2xl font-extrabold uppercase tracking-wide sm:text-3xl">
              {product.name}
            </h1>
            <img
              src="/images/entrega.gif"
              alt="Entrega automática"
              className="mt-3 block h-9 w-auto"
              draggable={false}
            />
            <div className="mt-5 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-extrabold text-accent">{brl(product.price_cents)}</span>
              {product.compare_cents ? (
                <span className="text-sm text-faint line-through">{brl(product.compare_cents)}</span>
              ) : null}
              {off > 0 ? (
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                  -{off}%
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted">No PIX ou cartão, com entrega automática após a confirmação.</p>
            <div className="mt-6 flex flex-col gap-3">
              <Button asChild size="lg" className="cta-pulse btn-shine w-full uppercase tracking-wide">
                <Link to="/comprar/$slug" params={{ slug: product.slug }}>
                  Comprar agora
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full border-accent/60 uppercase tracking-wide text-fg"
              >
                <Link to="/produtos">Ver outros pacotes</Link>
              </Button>
            </div>
          </div>
        </div>

        <section className="mt-10 rounded-lg border border-line bg-surface px-4 py-8" aria-labelledby="resgatar">
          <h2
            id="resgatar"
            className="text-center font-sans text-sm font-extrabold uppercase tracking-wide sm:text-base"
          >
            Como resgatar seus Robux
          </h2>
          <div className="mt-5">
            <PandaVideo />
          </div>
          <h3 className="mt-8 text-center font-sans text-sm font-extrabold uppercase tracking-wide">
            <span className="border-b-2 border-accent pb-1">Passo a passo:</span>
          </h3>
          <ol className="mx-auto mt-5 max-w-xl space-y-3 text-sm">
            {[
              "Assim que finalizar a compra, o código de resgate chega direto no seu e-mail de forma totalmente automática, igual explicado no vídeo acima",
              "Você recebe o código de resgate em poucos segundos após a compra!",
              "Vá até a opção \"Resgatar Cartões Roblox\" e digite o código enviado por e-mail",
              "Pronto, seus Robux entram na conta na hora. Simples, prático, rápido e seguro!",
            ].map((text, i) => (
              <li key={text} className="flex gap-3">
                <span className="w-4 shrink-0 text-right font-bold text-accent">{i + 1}.</span>
                <span className="text-fg/90">{text}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <FeedbackMarquee />
    </SiteShell>
  );
}
