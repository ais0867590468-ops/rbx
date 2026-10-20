import { BadgeCheck, Headset, Lock, QrCode, Rocket, Sparkles, Users } from "lucide-react";

const ITEMS = [
  { icon: Rocket, label: "Entrega automática" },
  { icon: QrCode, label: "PIX na hora" },
  { icon: Sparkles, label: "Robux com preço baixo" },
  { icon: Lock, label: "Checkout protegido" },
  { icon: Headset, label: "Suporte por ticket" },
  { icon: Users, label: "129 mil seguidores" },
  { icon: BadgeCheck, label: "Compra rápida e segura" },
];

function Sequence({ id }: { id: string }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={id !== "a" ? true : undefined}>
      {ITEMS.map(({ icon: Icon, label }) => (
        <span key={`${id}-${label}`} className="ticker-item">
          <Icon className="size-4 shrink-0 text-robux" strokeWidth={2.2} />
          <span>{label}</span>
          <span className="ticker-sep" aria-hidden />
        </span>
      ))}
    </div>
  );
}

/** Single slim band, scrolls to the right, seamless loop (two identical halves). */
export function Ticker() {
  return (
    <div className="ticker-band py-2">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-[#060a18] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-[#060a18] to-transparent" />
      <div className="marquee-track flex items-center">
        <Sequence id="a" />
        <Sequence id="b" />
      </div>
    </div>
  );
}
