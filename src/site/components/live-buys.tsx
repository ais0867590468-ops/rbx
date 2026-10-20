import { useEffect, useState } from "react";
import { fmtNum } from "@/lib/utils";

const NAMES = [
  "Ana",
  "Lucas",
  "Marina",
  "Pedro",
  "Julia",
  "Rafael",
  "Camila",
  "Bruno",
  "Larissa",
  "Gabriel",
  "Beatriz",
  "Thiago",
  "Fernanda",
  "Gustavo",
  "Isabela",
  "Diego",
  "Amanda",
  "Henrique",
  "Leticia",
  "Caio",
];

const PACKS = [1200, 1700, 2100, 3600, 4500, 7000, 10000];

type Buy = { id: number; name: string; amount: number };

function pick<T>(list: T[]) {
  return list[Math.floor(Math.random() * list.length)];
}

export function LiveBuys() {
  const [buy, setBuy] = useState<Buy | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let showTimer = 0;
    let hideTimer = 0;
    let seq = 0;
    const arm = (delay: number) => {
      showTimer = window.setTimeout(() => {
        seq += 1;
        setBuy({ id: seq, name: pick(NAMES), amount: pick(PACKS) });
        setOpen(true);
        hideTimer = window.setTimeout(() => setOpen(false), 4800);
        arm(8000 + Math.random() * 12000);
      }, delay);
    };
    arm(5000 + Math.random() * 3000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!buy) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-30 w-[min(100vw-2rem,20rem)]" aria-live="polite">
      <div
        className={`flex items-center gap-3 rounded-2xl border border-robux/35 bg-ink/95 p-2 pr-3 shadow-[var(--shadow-lift)] backdrop-blur-md transition-all duration-300 ${
          open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <img
          src={`/images/cards/${buy.amount}.jpg`}
          alt=""
          className="h-16 w-12 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-robux">Acabou de comprar</p>
          <p className="truncate text-sm font-medium text-accent-fg">
            {buy.name} · {fmtNum(buy.amount)} Robux
          </p>
          <p className="text-xs text-muted">entrega automática liberada</p>
        </div>
      </div>
    </div>
  );
}
