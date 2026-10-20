import { Lock, Zap } from "lucide-react";
import { GiftCardFace } from "@/site/components/gift-card";
import { CardMark, PixMark } from "@/site/components/pay-marks";
import { brl, fmtNum } from "@/lib/utils";

export function OrderAside({
  name,
  robux,
  priceCents,
  compareCents,
  sold,
}: {
  name: string;
  image?: string;
  robux: number;
  priceCents: number;
  compareCents?: number | null;
  sold?: number;
}) {
  return (
    <aside className="lg:sticky lg:top-24">
      <div className="overflow-hidden rounded-xl border border-line bg-surface fillet">
        <div className="flex items-center gap-4 p-3 lg:block lg:p-0">
          <GiftCardFace
            amount={robux}
            size="sm"
            className="h-24 w-16 shrink-0 lg:hidden"
          />
          <GiftCardFace amount={robux} className="hidden lg:block lg:aspect-[3/4] lg:w-full" />
          <div className="min-w-0 lg:space-y-4 lg:p-5">
            <div>
              <p className="font-display text-base font-semibold lg:text-lg">{name}</p>
              <div className="mt-1 flex items-baseline gap-2 lg:mt-2 lg:gap-3">
                <span className="font-display text-xl font-semibold text-accent lg:text-3xl">
                  {brl(priceCents)}
                </span>
                {compareCents ? (
                  <span className="text-xs text-faint line-through lg:text-sm">{brl(compareCents)}</span>
                ) : null}
              </div>
            </div>
            {typeof sold === "number" ? (
              <p className="mt-1 text-xs text-faint lg:mt-0">
                {fmtNum(sold)} pessoas já compraram este pacote
              </p>
            ) : null}
          </div>
        </div>
        <div className="hidden space-y-4 border-t border-line p-5 lg:block">
          <div className="grid gap-2">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2.5">
              <Lock className="size-4 text-accent" />
              <div>
                <p className="text-sm font-medium">Pagamento protegido</p>
                <p className="text-xs text-muted">Checkout em ambiente criptografado</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2.5">
              <Zap className="size-4 text-accent" />
              <div>
                <p className="text-sm font-medium">Entrega automática</p>
                <p className="text-xs text-muted">Robux liberados após a confirmação</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <PixMark />
            <p className="text-xs text-muted">PIX instantâneo</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
