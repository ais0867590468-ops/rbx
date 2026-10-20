import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, CreditCard, Mail, UserRound } from "lucide-react";
import { SiteShell } from "@/site/components/site-shell";
import { Button } from "@/components/ui/button";
import { STEPS } from "@/site/content";
import { howToJsonLd, ldString } from "@/site/seo";

export const Route = createFileRoute("/como-funciona")({
  component: ComoFunciona,
  head: () => ({
    meta: [
      { title: "Como funciona a compra de Robux | RecargasBuxs" },
      {
        name: "description",
        content:
          "Veja o passo a passo: escolha o pacote, pague no PIX ou cartão, aceite a notificação no Roblox e receba seus Robux. Se houver problema, o código chega por e-mail.",
      },
    ],
    scripts: [{ type: "application/ld+json", children: ldString(howToJsonLd()) }],
  }),
});

const ICONS = [UserRound, CreditCard, BellRing, Mail];

function ComoFunciona() {
  return (
    <SiteShell>
      <main className="mx-auto max-w-4xl px-4 py-12">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Passo a passo</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Como funciona</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Comprar Robux na RecargasBuxs leva poucos minutos. Veja o caminho completo, do pacote até o Robux na sua
          conta.
        </p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2">
          {STEPS.map((s, i) => {
            const Icon = ICONS[i] ?? UserRound;
            return (
              <li key={s.title} className="hover-lift rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-lg bg-accent/15 text-accent">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-display text-3xl font-semibold text-faint">{i + 1}</span>
                </div>
                <h2 className="mt-4 font-display text-lg font-semibold">{s.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="btn-shine">
            <Link to="/produtos">
              Escolher meu pacote
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/suporte">Falar com o suporte</Link>
          </Button>
        </div>
      </main>
    </SiteShell>
  );
}
