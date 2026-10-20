import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { SiteShell } from "@/site/components/site-shell";
import { Badge } from "@/components/ui/badge";
import { ChatComposer, ChatThread } from "@/components/live-chat";
import { useTicketChat } from "@/lib/use-ticket-chat";
import { getPublicTicket, pollPublicTicket, replyPublicTicket } from "@/site/store-fn";

type Search = { k?: string };
type TicketView = NonNullable<Awaited<ReturnType<typeof getPublicTicket>>>;

const STATUS_LABEL: Record<string, string> = {
  open: "🟢 Em atendimento",
  waiting: "💬 Equipe respondeu",
  closed: "🔒 Encerrado",
};

export const Route = createFileRoute("/ticket/$publicId")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    k: typeof search.k === "string" ? search.k : undefined,
  }),
  loaderDeps: ({ search }) => ({ k: search.k }),
  loader: async ({ params, deps }) => {
    if (!deps.k) return null;
    return getPublicTicket({ data: { publicId: params.publicId, secret: deps.k } });
  },
  component: TicketPage,
});

function TicketPage() {
  const ticket = Route.useLoaderData();
  const { k } = Route.useSearch();

  if (!ticket || !k) {
    return (
      <SiteShell>
        <main className="mx-auto max-w-lg px-4 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold">Ticket privado</h1>
          <p className="mt-2 text-sm text-muted">
            Este chamado exige o link completo enviado na abertura. Sem o código secreto não é possível
            ver a conversa.
          </p>
        </main>
      </SiteShell>
    );
  }
  return <TicketChat ticket={ticket} secret={k} />;
}

function TicketChat({ ticket, secret }: { ticket: TicketView; secret: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const chat = useTicketChat({
    initialMessages: ticket.messages,
    initialStatus: ticket.status,
    theirRole: "admin",
    poll: async ({ after, typing, visible }) => {
      const r = await pollPublicTicket({
        data: { publicId: ticket.public_id, secret, after, typing, visible },
      });
      if (!r) return null;
      return { status: r.status, messages: r.messages, typing: r.teamTyping, seenAt: r.teamSeenAt };
    },
  });
  const closed = chat.status === "closed";

  async function send() {
    const text = body.trim();
    if (text.length < 2) return;
    setBusy(true);
    try {
      const res = await replyPublicTicket({ data: { publicId: ticket.public_id, secret, message: text } });
      chat.append([res.message]);
      chat.stopTyping();
      chat.setStatus("open");
      setBody("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao responder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell>
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-faint">{ticket.public_id}</p>
            <h1 className="mt-1 font-display text-3xl font-semibold">{ticket.subject}</h1>
          </div>
          <Badge tone={closed ? "line" : "accent"}>{STATUS_LABEL[chat.status] ?? chat.status}</Badge>
        </div>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Conversa ao vivo: as respostas da equipe aparecem aqui sozinhas.
        </p>
        <div className="mt-6">
          <ChatThread
            messages={chat.messages}
            mine="customer"
            myLabel="Você"
            theirLabel={() => "Equipe RecargasBuxs"}
            theirTyping={chat.theirTyping}
            typingLabel="Equipe está digitando…"
            theirSeenAt={chat.theirSeenAt}
          />
        </div>
        {closed ? (
          <p className="mt-4 rounded-lg border border-line bg-surface p-4 text-center text-sm text-muted">
            Este atendimento foi encerrado pela equipe. Precisa de mais ajuda? Abra um novo ticket em
            Suporte.
          </p>
        ) : (
          <ChatComposer
            value={body}
            onChange={setBody}
            onTyping={chat.markTyping}
            onSend={send}
            busy={busy}
            placeholder="Escreva sua mensagem…"
          />
        )}
      </main>
    </SiteShell>
  );
}
