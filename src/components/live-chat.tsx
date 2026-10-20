import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/lib/use-ticket-chat";

function hhmm(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

export function TypingDots({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
      <span className="flex gap-1">
        <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted" />
      </span>
      {label}
    </div>
  );
}

/** Chat bubbles: messages from `mine` on the right, the other side on the left. */
export function ChatThread({
  messages,
  mine,
  myLabel,
  theirLabel,
  theirTyping,
  typingLabel,
  theirSeenAt,
}: {
  messages: ChatMessage[];
  mine: "admin" | "customer";
  myLabel: string;
  theirLabel: (m: ChatMessage) => string;
  theirTyping: boolean;
  typingLabel: string;
  theirSeenAt: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const lastMine = [...messages].reverse().find((m) => m.author_role === mine);
  const seen =
    lastMine && theirSeenAt ? new Date(theirSeenAt).getTime() >= new Date(lastMine.created_at).getTime() - 1000 : false;

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, theirTyping]);

  let lastDay = "";
  return (
    <div
      ref={box}
      className="max-h-[55vh] min-h-48 space-y-3 overflow-y-auto rounded-xl border border-line bg-bg p-4"
      aria-label="Conversa"
    >
      {messages.map((m) => {
        const own = m.author_role === mine;
        const day = dayLabel(m.created_at);
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <div key={m.id}>
            {showDay && day ? (
              <p className="my-2 text-center text-[11px] uppercase tracking-wide text-faint">{day}</p>
            ) : null}
            <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  own
                    ? "rounded-br-md border border-accent/30 bg-accent/10"
                    : "rounded-bl-md border border-line bg-surface"
                }`}
              >
                <p className="text-[11px] font-medium text-muted">{own ? myLabel : theirLabel(m)}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
                <p className="mt-1 text-right text-[10px] text-faint">
                  {hhmm(m.created_at)}
                  {own && lastMine?.id === m.id && seen ? " · ✓✓ Visto" : ""}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      {theirTyping ? <TypingDots label={typingLabel} /> : null}
    </div>
  );
}

/** Textarea + send button: Enter sends, Shift+Enter breaks the line. */
export function ChatComposer({
  value,
  onChange,
  onTyping,
  onSend,
  busy,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  onTyping: () => void;
  onSend: () => void;
  busy: boolean;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !busy) onSend();
      }}
    >
      <Textarea
        value={value}
        className="min-h-20"
        onChange={(e) => {
          onChange(e.target.value);
          if (e.target.value) onTyping();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (value.trim() && !busy) onSend();
          }
        }}
        placeholder={placeholder}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || !value.trim()}>
          Enviar
        </Button>
        {children}
        <span className="ml-auto text-[11px] text-faint">Enter envia · Shift+Enter quebra linha</span>
      </div>
    </form>
  );
}
