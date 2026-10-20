import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { CheckoutForm } from "@/site/components/checkout-form";
import { OrderAside } from "@/site/components/order-aside";
import { FeedbackMarquee } from "@/site/components/feedback-marquee";
import { SiteShell } from "@/site/components/site-shell";
import { Button } from "@/components/ui/button";
import { getProductBySlug } from "@/site/store-fn";
import { useCartLog } from "@/site/use-cart-log";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/comprar/$slug")({
  loader: async ({ params }) => getProductBySlug({ data: { slug: params.slug } }),
  component: ComprarPage,
});

const STEPS = [
  { n: "1", label: "Pacote", done: true },
  { n: "2", label: "Seus dados", done: false, current: true },
  { n: "3", label: "Pagamento", done: false },
];

function ComprarPage() {
  const product = Route.useLoaderData();
  useCartLog(product?.slug);

  if (!product) {
    return (
      <SiteShell compact>
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold">Produto não encontrado</h1>
          <Button asChild className="mt-6">
            <Link to="/produtos">Voltar aos pacotes</Link>
          </Button>
        </main>
      </SiteShell>
    );
  }

  return (
    <SiteShell compact>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <ol className="mx-auto mb-8 flex max-w-lg items-center justify-between gap-2">
          {STEPS.map((step, i) => (
            <li key={step.n} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  step.done
                    ? "bg-accent text-on-accent"
                    : step.current
                      ? "border border-accent bg-accent/15 text-accent"
                      : "border border-line text-faint",
                )}
              >
                {step.done ? <Check className="size-3.5" /> : step.n}
              </span>
              <span className={cn("text-xs font-medium", step.current ? "text-fg" : "text-muted")}>
                {step.label}
              </span>
              {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-line" /> : null}
            </li>
          ))}
        </ol>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(240px,340px)] md:items-start">
          <div className="rounded-xl border border-line bg-surface p-5 sm:p-7 fillet">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Checkout RecargasBuxs</p>
            <h1 className="mt-2 font-display text-3xl font-semibold">Seus dados</h1>
            <p className="mt-2 text-sm text-muted">
              Informe a conta, escolha PIX ou cartão e receba na hora após a confirmação.
            </p>
            <div className="mt-8">
              <CheckoutForm product={product} />
            </div>
          </div>
          <div className="md:order-last">
            <OrderAside
              name={product.name}
              robux={product.robux_amount}
              priceCents={product.price_cents}
              compareCents={product.compare_cents}
              sold={product.sold_count}
            />
            <p className="mt-3 text-center text-xs text-faint">
              <Link to="/produto/$slug" params={{ slug: product.slug }} className="underline">
                Voltar ao pacote
              </Link>
            </p>
          </div>
        </div>
      </main>
      <FeedbackMarquee />
    </SiteShell>
  );
}
