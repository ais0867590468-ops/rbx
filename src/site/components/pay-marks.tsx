import { cn } from "@/lib/utils";

export function PixMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-7 shrink-0", className)} aria-label="PIX">
      <path
        fill="#32BCAD"
        d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156"
      />
    </svg>
  );
}

export function CardMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} aria-label="Visa, Mastercard e Elo">
      <span className="inline-flex h-5 items-center rounded bg-[#1A1F71] px-1.5 text-[10px] font-bold tracking-[0.08em] text-white">
        VISA
      </span>
      <svg viewBox="0 0 36 22" className="h-5 w-8 shrink-0" aria-hidden>
        <rect width="36" height="22" rx="4" fill="#fff" />
        <circle cx="14" cy="11" r="6.5" fill="#EB001B" />
        <circle cx="22" cy="11" r="6.5" fill="#F79E1B" />
        <path d="M18 6.2a6.5 6.5 0 0 1 0 9.6 6.5 6.5 0 0 1 0-9.6z" fill="#FF5F00" />
      </svg>
      <svg viewBox="0 0 36 22" className="h-5 w-8 shrink-0" aria-hidden>
        <rect width="36" height="22" rx="4" fill="#111" />
        <circle cx="13" cy="11" r="5" fill="#FFD100" />
        <circle cx="18" cy="11" r="5" fill="#00A4E0" />
        <circle cx="23" cy="11" r="5" fill="#EF4123" />
      </svg>
    </span>
  );
}
