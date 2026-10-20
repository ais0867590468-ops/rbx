import { Link } from "@tanstack/react-router";
import { LayoutGrid, Lock, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LiveBuys } from "@/site/components/live-buys";
import { logVisit } from "@/site/store-fn";
import { bootUtmify } from "@/site/tracking-boot";
import { captureAttribution, getAttribution } from "@/site/tracking-client";
import { cn } from "@/lib/utils";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="RecargasBuxs">
      <img
        src="/images/logo-rb.webp"
        alt="Recarga Bux"
        className="size-12 shrink-0 rounded-full object-cover"
        draggable={false}
      />
    </Link>
  );
}

export function ReclameBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <img
        src="/images/reclameaqui-dark.svg"
        alt="Reclame AQUI"
        className="h-8 w-auto drop-shadow-[0_0_12px_rgba(52,209,122,0.35)]"
        draggable={false}
      />
      <span className="text-xs font-medium leading-tight text-muted">
        Loja avaliada
        <br />
        no Reclame AQUI
      </span>
    </span>
  );
}

const NAV = [
  { to: "/produtos" as const, label: "Pacotes" },
  { to: "/suporte" as const, label: "Suporte" },
  { to: "/conta" as const, label: "Minha conta" },
  { to: "/termos" as const, label: "Termos" },
];

export function SiteShell({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const query = window.location.search.slice(0, 400);
    captureAttribution();
    void bootUtmify();
    logVisit({ data: { path, query, tracking: getAttribution() } }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="header-in sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-xl">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#8a6d1f] via-[#e4c15a] to-[#8a6d1f]" aria-hidden />
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          {compact ? (
            <p className="flex items-center gap-2 text-xs font-medium text-muted sm:text-sm">
              <Lock className="size-3.5 text-accent" />
              Checkout seguro
            </p>
          ) : (
            <>
              <nav className="hidden items-center gap-7 md:flex">
                {NAV.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group relative text-sm font-medium text-muted transition-colors hover:text-fg after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-0 after:bg-robux after:transition-all after:duration-300 hover:after:w-full"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="hidden items-center gap-3 md:flex">
                <Link
                  to="/produtos"
                  className="btn-shine inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-on-accent transition-transform hover:scale-105"
                >
                  Comprar Robux
                </Link>
              </div>
              <button
                type="button"
                className="grid size-11 place-items-center rounded-md border border-line md:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-label="Menu"
              >
                {open ? <X className="size-4" /> : <Menu className="size-4" />}
              </button>
            </>
          )}
        </div>
        {open && !compact ? (
          <div className="border-t border-line px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-3 text-sm font-medium"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </header>
      {compact ? null : (
        <Link
          to="/produtos"
          className="flex items-center justify-center gap-2 border-b border-line bg-bg py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-fg transition-colors hover:text-accent"
        >
          <LayoutGrid className="size-3.5 text-accent" />
          Todos os produtos
        </Link>
      )}
      <div>{children}</div>
      {compact ? null : <LiveBuys />}
      {compact ? (
        <p className="px-4 py-6 text-center text-xs text-faint">
          Pagamento protegido. Entrega automática após a confirmação.
        </p>
      ) : (
        <footer className="mt-16 border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4">
            <div className="md:col-span-2">
              <Logo />
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                RecargasBuxs entrega Robux com PIX ou cartão, checkout protegido e entrega automática
                após a confirmação do pagamento.
              </p>
              <ReclameBadge className="mt-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Loja</p>
              <div className="mt-3 flex flex-col gap-2 text-sm text-muted">
                <Link to="/produtos" className="hover:text-fg">
                  Pacotes de Robux
                </Link>
                <Link to="/suporte" className="hover:text-fg">
                  Abrir ticket
                </Link>
                <Link to="/conta" className="hover:text-fg">
                  Minha conta
                </Link>
                <Link to="/como-funciona" className="hover:text-fg">
                  Como funciona
                </Link>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold">Legal</p>
              <div className="mt-3 flex flex-col gap-2 text-sm text-muted">
                <Link to="/privacidade" className="hover:text-fg">
                  Privacidade
                </Link>
                <Link to="/termos" className="hover:text-fg">
                  Termos de uso
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t border-line">
            <div className="mx-auto max-w-6xl px-4 py-6">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Compra 100% segura
              </p>
              <img
                src="/images/selo.png"
                alt="Google Site Seguro, SSL Blindado e Site Blindado"
                className="mx-auto mt-3 h-14 w-auto max-w-full sm:h-16"
                loading="lazy"
                draggable={false}
              />
            </div>
          </div>
          <div className="border-t border-line">
            <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-faint">
              © {new Date().getFullYear()} RecargasBuxs. Pagamentos protegidos. Entrega automática.
              Roblox e Robux são marcas de seus respectivos donos. Não somos afiliados à Roblox
              Corporation.
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
