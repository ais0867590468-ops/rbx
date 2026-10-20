import { useEffect, useState } from "react";
import { Check, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { hasOrderFeedback, submitFeedback } from "@/site/feedback-fn";

/** Shown after a paid order: the customer rates it; the owner approves it in the admin. */
export function FeedbackForm({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"loading" | "form" | "sent">("loading");
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    hasOrderFeedback({ data: { orderId } })
      .then((sent) => alive && setState(sent ? "sent" : "form"))
      .catch(() => alive && setState("form"));
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (state === "loading") return null;

  if (state === "sent") {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
        <Check className="mt-0.5 size-4 shrink-0 text-success" />
        <p className="text-sm text-fg">
          Obrigado pelo seu feedback! Ele aparece na loja assim que a nossa equipe revisar.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitFeedback({ data: { orderId, rating, message, name: name || undefined, website } });
      setState("sent");
      toast.success("Feedback enviado. Obrigado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  const shown = hover || rating;

  return (
    <form onSubmit={submit} className="mt-6 rounded-xl border border-line bg-bg/60 p-4">
      <p className="font-display text-lg font-semibold">Como foi a sua compra?</p>
      <p className="text-xs text-muted">Seu feedback ajuda outros jogadores a comprar com segurança.</p>
      <div className="mt-3 flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            <Star className={`size-7 ${n <= shown ? "fill-robux text-robux" : "text-line"}`} strokeWidth={1.8} />
          </button>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        minLength={8}
        maxLength={280}
        rows={3}
        placeholder="Conte como foi a entrega e o atendimento."
        className="mt-3 w-full resize-none rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="Seu primeiro nome (opcional)"
        className="mt-2 h-10 w-full rounded-md border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
      />
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-faint">{message.length}/280</span>
        <Button type="submit" disabled={busy || message.trim().length < 8}>
          {busy ? "Enviando…" : "Enviar feedback"}
        </Button>
      </div>
    </form>
  );
}
