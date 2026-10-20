import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PromoRow } from "@/site/components/product-card";
import { PandaVideo } from "@/site/components/panda-video";
import { SiteShell } from "@/site/components/site-shell";
import { Reveal } from "@/site/components/reveal";
import { getSiteOrigin, listProducts, type Product } from "@/site/store-fn";
import { FAQ, SITE_DESCRIPTION, SITE_TITLE } from "@/site/content";
import { homeJsonLd, ldString } from "@/site/seo";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (import.meta.env.VITE_APP_MODE === "admin") throw redirect({ to: "/admin" });
  },
  loader: async (): Promise<{ products: Product[]; origin: string }> => {
    if (import.meta.env.VITE_APP_MODE === "admin") return { products: [], origin: "" };
    const [products, origin] = await Promise.all([listProducts(), getSiteOrigin()]);
    return { products, origin };
  },
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    return {
      meta: [{ title: SITE_TITLE }, { name: "description", content: SITE_DESCRIPTION }],
      links: origin ? [{ rel: "canonical", href: `${origin}/` }] : [],
      scripts: origin
        ? [{ type: "application/ld+json", children: ldString(homeJsonLd(origin, loaderData?.products ?? [])) }]
        : [],
    };
  },
  component: Home,
});

/** Centered gold section heading (reference store style). */
function SectionTitle({ title, sub, tone = "gold" }: { title: string; sub?: string; tone?: "gold" | "white" }) {
  return (
    <div className="text-center">
      <h2
        className={`font-sans text-xl font-extrabold uppercase tracking-wide sm:text-2xl ${
          tone === "gold" ? "text-accent" : "text-fg"
        }`}
      >
        {title}
      </h2>
      {tone === "white" ? <div className="mx-auto mt-2 h-[2px] w-28 bg-accent" aria-hidden /> : null}
      {sub ? <p className="mx-auto mt-2 max-w-md text-xs text-muted sm:text-sm">{sub}</p> : null}
    </div>
  );
}

function Home() {
  const { products } = Route.useLoaderData();
  return (
    <SiteShell>
      <main>
        <h1 className="sr-only">RecargasBuxs: Robux barato com entrega automática</h1>
        <section aria-label="Oferta">
          <Link to="/produtos" aria-label="Ver pacotes de Robux">
            <img
              src="/images/banner-home.jpg"
              alt="Cansado de pagar caro em Robux? Aqui temos os melhores preços!"
              className="block h-auto w-full object-cover"
              width={1920}
              height={640}
              fetchPriority="high"
              draggable={false}
            />
          </Link>
        </section>

        <section className="mx-auto max-w-6xl px-4 pt-10" aria-labelledby="promocoes">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="promocoes" className="font-sans text-xl font-extrabold uppercase tracking-wide text-accent">
                Promoções
              </h2>
              <div className="mt-1.5 h-[2px] w-24 bg-accent" aria-hidden />
            </div>
            <Link to="/produtos" className="text-xs font-semibold text-muted hover:text-accent">
              Ver todos
            </Link>
          </div>
          <div className="mt-5">
            <PromoRow products={products} />
          </div>
        </section>

        <Reveal as="section" className="mx-auto max-w-6xl px-4 py-14">
          <SectionTitle title="Como funciona a compra?" sub="Processo simples e rápido!" tone="white" />
          <div className="mt-6">
            <PandaVideo />
          </div>
        </Reveal>

        <Reveal as="section" className="mx-auto max-w-3xl px-4 pb-10">
          <SectionTitle
            title="Mais de 100 mil seguidores!"
            sub="Junte-se à nossa comunidade e fique por dentro das melhores ofertas."
          />
          <figure className="pointer-events-none mx-auto mt-6 max-w-md overflow-hidden rounded-xl select-none">
            <img
              src="/images/instagram.webp"
              alt="Perfil da RecargasBuxs no Instagram com 129 mil seguidores"
              className="h-auto w-full object-contain"
              loading="lazy"
              draggable={false}
            />
          </figure>
        </Reveal>

        <Reveal as="section" className="mx-auto max-w-3xl px-4 py-10">
          <SectionTitle
            title="Explore o mundo Roblox"
            sub="Milhares de jogos e experiências esperam por você."
          />
          <img
            src="/images/world.webp"
            alt="Explore o mundo Roblox"
            className="mt-6 aspect-[16/10] w-full rounded-xl border border-line object-cover object-center"
            loading="lazy"
          />
        </Reveal>

        <Reveal as="section" className="mx-auto max-w-3xl px-4 py-10">
          <SectionTitle
            title="Entrega automática"
            sub="Receba seus Robux instantaneamente após a confirmação do pagamento via PIX."
          />
          <img
            src="/images/entrega.gif"
            alt="Entrega automática de Robux"
            className="mx-auto mt-6 h-auto w-full max-w-xl"
            loading="lazy"
            draggable={false}
          />
        </Reveal>

        <Reveal as="section" className="mx-auto max-w-3xl px-4 py-12">
          <h2 className="font-sans text-xl font-extrabold uppercase tracking-wide text-accent">
            Perguntas frequentes
          </h2>
          <div className="mt-6 divide-y divide-line rounded-xl border border-accent/30 bg-surface px-5">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="cursor-pointer list-none font-medium">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </main>
    </SiteShell>
  );
}
