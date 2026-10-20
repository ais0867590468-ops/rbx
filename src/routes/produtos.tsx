import { createFileRoute } from "@tanstack/react-router";
import { ProductCard } from "@/site/components/product-card";
import { SiteShell } from "@/site/components/site-shell";
import { listProducts } from "@/site/store-fn";

export const Route = createFileRoute("/produtos")({
  loader: () => listProducts(),
  head: () => ({
    meta: [
      { title: "Pacotes de Robux com os menores preços | RecargasBuxs" },
      {
        name: "description",
        content:
          "Veja todos os pacotes de Robux e compare os preços. Pague no PIX ou cartão e receba na sua conta do Roblox, sem pedir senha.",
      },
    ],
  }),
  component: Produtos,
});

function Produtos() {
  const products = Route.useLoaderData();
  return (
    <SiteShell>
      <main className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Catálogo</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Pacotes de Robux</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Cada cartão mostra a quantidade. Escolha o pacote e avance para o checkout exclusivo.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </main>
    </SiteShell>
  );
}
