import { useEffect, useState } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { listFeedbacks, type PublicFeedback } from "@/site/feedback-fn";
import { fmtNum } from "@/lib/utils";

type Data = { items: PublicFeedback[]; count: number; average: number | null };

function ago(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  return months === 1 ? "há 1 mês" : `há ${months} meses`;
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`Nota ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`size-3.5 ${n <= value ? "fill-robux text-robux" : "text-line"}`}
          strokeWidth={1.8}
        />
      ))}
    </span>
  );
}

function FeedbackCard({ item }: { item: PublicFeedback }) {
  return (
    <figure className="feedback-card">
      <div className="flex items-center justify-between gap-3">
        <Stars value={item.rating} />
        <span className="text-[11px] text-faint">{ago(item.created_at)}</span>
      </div>
      <blockquote className="mt-3 line-clamp-4 text-sm leading-relaxed text-fg">“{item.message}”</blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/20 font-display text-sm font-semibold text-accent">
          {item.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <BadgeCheck className="size-3 text-success" />
            {item.robux_amount ? `Comprou ${fmtNum(item.robux_amount)} Robux` : "Cliente verificado"}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

function Half({ items, id }: { items: PublicFeedback[]; id: string }) {
  // Short lists are repeated so each half is always wider than the viewport (seamless loop).
  const reps = Math.max(1, Math.ceil(8 / items.length));
  const list = Array.from({ length: reps }, () => items).flat();
  return (
    <div className="flex shrink-0 gap-4 pr-4" aria-hidden={id !== "a" ? true : undefined}>
      {list.map((item, i) => (
        <FeedbackCard key={`${id}-${item.id}-${i}`} item={item} />
      ))}
    </div>
  );
}

/**
 * Rolling band of REAL customer feedback (approved in the admin). Renders
 * nothing until there is at least one approved entry — never shows invented reviews.
 */
export function FeedbackMarquee({ className = "" }: { className?: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let alive = true;
    listFeedbacks()
      .then((d) => alive && setData(d as Data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data || data.items.length === 0) return null;
  const duration = Math.max(40, Math.min(110, data.items.length * 9));

  return (
    <section className={`feedback-section ${className}`} aria-label="Feedbacks de clientes">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3 px-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Quem já comprou</p>
          <h2 className="font-display text-2xl font-semibold">O que os clientes dizem</h2>
        </div>
        {data.average ? (
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5">
            <Stars value={Math.round(data.average)} />
            <span className="text-sm font-semibold">{data.average.toFixed(1).replace(".", ",")}</span>
            <span className="text-xs text-muted">· {fmtNum(data.count)} feedbacks</span>
          </div>
        ) : null}
      </div>
      <div className="feedback-band mt-5">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-bg to-transparent sm:w-20" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-bg to-transparent sm:w-20" />
        <div className="feedback-track flex" style={{ ["--feedback-dur" as string]: `${duration}s` }}>
          <Half items={data.items} id="a" />
          <Half items={data.items} id="b" />
        </div>
      </div>
    </section>
  );
}
