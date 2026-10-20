import { hasCardArt } from "@/site/card-art";
import { cn, fmtNum } from "@/lib/utils";

/** Real card art for the classic packs; a drawn card (same look) for every other amount. */
export function GiftCardFace({
  amount,
  className,
}: {
  amount: number;
  className?: string;
  size?: "sm" | "md";
}) {
  if (hasCardArt(amount)) {
    return (
      <div className={cn("overflow-hidden bg-ink", className)}>
        <img
          src={`/images/cards/${amount}.jpg`}
          alt={`${fmtNum(amount)} Robux`}
          loading="lazy"
          decoding="async"
          className="h-auto w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className={cn("overflow-hidden bg-ink", className)}>
      <div
        role="img"
        aria-label={`${fmtNum(amount)} Robux`}
        className="relative flex aspect-[16/10] w-full flex-col justify-between overflow-hidden p-4 text-white"
        style={{
          background:
            "radial-gradient(circle at 15% 15%, rgb(228 193 90 / 0.4), transparent 45%), radial-gradient(circle at 90% 90%, rgb(138 109 31 / 0.5), transparent 50%), linear-gradient(135deg, #0a0a0a, #2b2410 60%, #0a0a0a)",
        }}
      >
        <div className="flex items-center gap-2">
          <img src="/images/logo.png" alt="" aria-hidden className="size-7 object-contain" draggable={false} />
          <span className="font-display text-xs font-bold uppercase tracking-[0.2em] text-white/85">
            RecargasBuxs
          </span>
        </div>
        <div>
          <p className="font-display text-4xl font-bold leading-none drop-shadow">{fmtNum(amount)}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#e4c15a]">Robux</p>
        </div>
        <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -right-2 -top-2 size-20 rounded-full border border-white/10" />
      </div>
    </div>
  );
}
