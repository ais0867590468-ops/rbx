import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, CheckCircle2, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OrderAside } from "@/site/components/order-aside";
import { FeedbackForm } from "@/site/components/feedback-form";
import { FeedbackMarquee } from "@/site/components/feedback-marquee";
import { CardMark, PixMark } from "@/site/components/pay-marks";
import { SiteShell } from "@/site/components/site-shell";
import { Button } from "@/components/ui/button";
import { getCheckout, pollCheckout } from "@/site/store-fn";
import { brl, cn } from "@/lib/utils";

export const Route = createFileRoute("/checkout/$orderId")({
  loader: ({ params }) => getCheckout({ data: { orderId: params.orderId } }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const initial = Route.useLoaderData();
  const { orderId } = Route.useParams();
  const [status, setStatus] = useState(initial?.status ?? "pending");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!initial || status === "paid" || status === "delivered") return;
    const t = window.setInterval(() => {
      pollCheckout({ data: { orderId } })
        .then((row) => {
          if (row?.status) setStatus(row.status);
        })
        .catch(() => {});
    }, 3500);
    return () => window.clearInterval(t);
  }, [initial, orderId, status]);

  if (!initial) {
    return (
      <SiteShell compact>
        <main className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold">Pedido não encontrado</h1>
        </main>
      </SiteShell>
    );
  }

  const paid = status === "paid" || status === "delivered";
  const isPix = (initial.paymentMethod ?? "pix") === "pix";

  async function copyPix() {
    if (!initial?.pixBrCode) return;
    await navigator.clipboard.writeText(initial.pixBrCode);
    setCopied(true);
    toast.success("Código PIX copiado.");
  }

  return (
    <SiteShell compact>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <ol className="mx-auto mb-8 flex max-w-lg items-center justify-between gap-2">
          {["Pacote", "Seus dados", "Pagamento"].map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  i < 2 || paid ? "bg-accent text-on-accent" : "border border-accent bg-accent/15 text-accent",
                )}
              >
                {i < 2 || paid ? <Check className="size-3.5" /> : "3"}
              </span>
              <span className={cn("text-xs font-medium", i === 2 ? "text-fg" : "text-muted")}>{label}</span>
              {i < 2 ? <span className="h-px flex-1 bg-line" /> : null}
            </li>
          ))}
        </ol>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(240px,340px)] md:items-start">
          <div>
            {paid ? (
              <div className="rounded-xl border border-line bg-surface p-8 fillet">
                <CheckCircle2 className="size-10 text-success" />
                <h1 className="mt-4 font-display text-3xl font-semibold">Pagamento confirmado</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Pedido {initial.id} para <strong className="text-fg">{initial.robloxUsername}</strong>.
                  A entrega automática dos Robux está em andamento.
                </p>
                <Button asChild className="mt-6">
                  <Link to="/suporte">Precisa de ajuda?</Link>
                </Button>
                <FeedbackForm orderId={initial.id} />
              </div>
            ) : isPix ? (
              <div className="rounded-xl border border-line bg-surface p-6 fillet">
                <div className="flex items-center gap-3">
                  <PixMark className="size-8" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                      Pagamento PIX
                    </p>
                    <h1 className="font-display text-2xl font-semibold">Escaneie para pagar</h1>
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Conta <span className="font-medium text-fg">{initial.robloxUsername}</span> ·{" "}
                  {brl(initial.priceCents)}
                </p>
                <p className="mt-1 font-mono text-xs text-faint">{initial.id}</p>
                <div className="mx-auto mt-6 w-60 rounded-xl border border-line bg-accent-fg p-3">
                  {initial.pixQrImage ? (
                    <img src={initial.pixQrImage} alt="QR Code PIX" className="h-full w-full" />
                  ) : (
                    <p className="py-16 text-center text-sm text-muted">Use o copia e cola abaixo.</p>
                  )}
                </div>
                <p className="mt-4 text-center text-sm text-muted">
                  Esta página atualiza sozinha quando o pagamento confirmar. Entrega automática.
                </p>
                <Button type="button" variant="outline" className="mt-4 w-full" onClick={copyPix}>
                  <Copy className="size-4" />
                  {copied ? "Copiado" : "Copiar código PIX"}
                </Button>
                {initial.pixBrCode ? (
                  <p className="mt-3 break-all rounded-md bg-bg p-3 font-mono text-xs leading-relaxed text-muted">
                    {initial.pixBrCode}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-surface p-6 fillet">
                <div className="flex items-center gap-3">
                  <CardMark />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                      Pagamento no cartão
                    </p>
                    <h1 className="font-display text-2xl font-semibold">Aguardando autorização</h1>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Pedido <strong className="text-fg">{initial.id}</strong> para a conta{" "}
                  <strong className="text-fg">{initial.robloxUsername}</strong> · {brl(initial.priceCents)}.
                </p>
                {initial.checkoutUrl ? (
                  <div className="mt-6 space-y-3">
                    <Button asChild size="lg" className="cta-pulse w-full">
                      <a href={initial.checkoutUrl}>
                        Concluir pagamento no Cartão (Stripe)
                      </a>
                    </Button>
                    <p className="text-center text-xs text-muted">
                      Se o checkout seguro não abriu automaticamente, clique no botão acima para concluir.
                    </p>
                  </div>
                ) : null}
                <div className="mt-6 rounded-lg border border-line bg-bg p-3.5 text-center text-xs text-muted leading-relaxed">
                  Esta página atualiza sozinha em tempo real assim que o pagamento for aprovado. Os Robux serão entregues logo em seguida.
                </div>
                <p className="mt-4 font-mono text-xs text-faint">{initial.id}</p>
              </div>
            )}
          </div>
          <div>
            <OrderAside
              name={initial.productName}
              robux={initial.robuxAmount}
              priceCents={initial.priceCents}
            />
          </div>
        </div>
      </main>
      <FeedbackMarquee />
    </SiteShell>
  );
}
