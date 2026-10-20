import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { GiftCardFace } from "@/site/components/gift-card";
import { brl, cn, fmtNum } from "@/lib/utils";
import type { Product } from "@/site/store-fn";

export function ProductCard({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  const off =
    product.compare_cents && product.compare_cents > product.price_cents
      ? Math.round((1 - product.price_cents / product.compare_cents) * 100)
      : 0;
  return (
    <Link
      to="/produto/$slug"
      params={{ slug: product.slug }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border border-accent/40 bg-surface transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-lift)]",
        compact ? "w-44 shrink-0 sm:w-52" : "w-full",
      )}
    >
      <div className="relative">
        <GiftCardFace amount={product.robux_amount} />
        {product.badge ? (
          <span className="absolute left-3 top-3">
            <Badge tone="ink">{product.badge}</Badge>
          </span>
        ) : null}
        {off > 0 ? (
          <span className="absolute right-3 top-3">
            <Badge tone="accent">-{off}%</Badge>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="font-sans text-[13px] font-bold uppercase tracking-wide">{product.name}</p>
        <p className="text-[11px] text-faint">{fmtNum(product.sold_count)} vendidos</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-accent">{brl(product.price_cents)}</span>
            {product.compare_cents ? (
              <span className="text-[11px] text-faint line-through">{brl(product.compare_cents)}</span>
            ) : null}
          </div>
          <span className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent">
            Comprar
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Single scrollable row of packages (home "PROMOÇÕES"), with arrows on desktop. */
export function PromoRow({ products }: { products: Product[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (products.length === 0) return null;
  const scroll = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * Math.max(240, (ref.current?.clientWidth ?? 600) * 0.8), behavior: "smooth" });
  return (
    <div className="relative">
      <div ref={ref} className="promo-row flex gap-4 overflow-x-auto scroll-smooth pb-3">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} compact />
        ))}
      </div>
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label="Anterior"
        className="absolute -left-3 top-1/3 hidden size-9 place-items-center rounded-full border border-accent/50 bg-bg/90 text-accent shadow-lg hover:bg-accent hover:text-on-accent md:grid"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label="Próximo"
        className="absolute -right-3 top-1/3 hidden size-9 place-items-center rounded-full border border-accent/50 bg-bg/90 text-accent shadow-lg hover:bg-accent hover:text-on-accent md:grid"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function Rail({ items, reverse }: { items: Product[]; reverse?: boolean }) {
  const loop = [...items, ...items];
  return (
    <div className="product-rail relative rounded-xl border border-accent/35 bg-ink/60 fillet">
      <div className={cn("product-rail-track", reverse && "product-rail-track-rev")}>
        {loop.map((p, i) => (
          <div key={`${p.id}-${i}`} className={i >= items.length ? "product-rail-dup" : undefined}>
            <ProductCard product={p} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Package rail: two rows (more Robux variations), scrolling in opposite directions. */
export function ProductMarquee({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  const sorted = [...products].sort((a, b) => a.robux_amount - b.robux_amount);
  if (sorted.length < 6) return <Rail items={products} />;
  const half = Math.ceil(sorted.length / 2);
  // Row 1: classic packs (original order); row 2: the extra variations.
  const first = products.filter((p) => p.sort_order <= 7);
  const second = products.filter((p) => p.sort_order > 7);
  const a = first.length > 0 && second.length > 0 ? first : sorted.slice(0, half);
  const b = first.length > 0 && second.length > 0 ? second : sorted.slice(half);
  return (
    <div className="space-y-4">
      <Rail items={a} />
      <Rail items={b} reverse />
    </div>
  );
}


