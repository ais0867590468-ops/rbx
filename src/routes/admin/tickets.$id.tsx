import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChatComposer, ChatThread } from "@/components/live-chat";
import { useTicketChat } from "@/lib/use-ticket-chat";
import { deleteTicketAdmin, getTicketAdmin, pollTicketAdmin, replyTicketAdmin } from "@/admin/admin-fn";

export const Route = createFileRoute("/admin/tickets/$id")({ component: TicketAdmin });

const STATUS_LABEL: Record<string, string> = {
  open: "🟢 aberto",
  waiting: "⏳ aguardando cliente",
  closed: "🔒 encerrado",
};

type TicketData = NonNullable<Awaited<ReturnType<typeof getTicketAdmin>>>;

function TicketAdmin() {
  const { id } = Route.useParams();
  const num = Number(id);
  const [data, setData] = useState<TicketData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    getTicketAdmin({ data: { id: num } })
      .then((d) => setData(d))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoaded(true));
  }, [num]);

  const back = (
    <Link to="/admin/tickets" className="text-sm text-muted hover:text-fg">
      ← Voltar aos tickets
    </Link>
  );

  if (!loaded) return <div className="h-40 animate-pulse rounded-xl bg-surface" />;
  if (!data) {
    return (
      <div className="space-y-3">
        {back}
        <p className="text-sm text-muted">Ticket não encontrado.</p>
      </div>
    );
  }
  // key = ticket id so switching tickets restarts the live chat state.
  return <AdminChat key={num} num={num} data={data} back={back} />;
}

function AdminChat({ num, data, back }: { num: number; data: TicketData; back: React.ReactNode }) {
  const ticket = data.ticket;
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const chat = useTicketChat({
    initialMessages: data.messages,
    initialStatus: ticket.status,
    theirRole: "customer",
    poll: async ({ after, typing, visible }) => {
      const r = await pollTicketAdmin({ data: { id: num, after, typing, visible } });
      if (!r) return null;
      return { status: r.status, messages: r.messages, typing: r.customerTyping, seenAt: r.customerSeenAt };
    },
  });
  const navigate = useNavigate();
  const closed = chat.status === "closed";

  async function remove() {
    if (!window.confirm(`Excluir o ticket ${ticket.public_id} e toda a conversa? Isso não pode ser desfeito.`)) return;
    setBusy(true);
    try {
      await deleteTicketAdmin({ data: { id: num } });
      toast.success("Ticket excluído.");
      await navigate({ to: "/admin/tickets" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
      setBusy(false);
    }
  }

  async function send(status: "waiting" | "closed", text: string) {
    setBusy(true);
    try {
      const res = await replyTicketAdmin({ data: { id: num, body: text, status } });
      chat.append([res.message]);
      chat.setStatus(res.status);
      chat.stopTyping();
      setBody("");
      if (status === "closed") toast.success("Ticket encerrado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {back}
      <p className="mt-4 font-mono text-xs text-faint">{ticket.public_id}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold">{ticket.subject}</h1>
        <Badge>{STATUS_LABEL[chat.status] ?? chat.status}</Badge>
      </div>
      <p className="mt-2 text-sm text-muted">
        {ticket.name} · {ticket.email}
        {ticket.order_id ? ` · Pedido ${ticket.order_id}` : ""}
      </p>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        Ao vivo: mensagens do cliente aparecem sozinhas.
      </p>
      <div className="mt-6">
        <ChatThread
          messages={chat.messages}
          mine="admin"
          myLabel="Você (equipe)"
          theirLabel={(m) => m.author_name}
          theirTyping={chat.theirTyping}
          typingLabel={`${ticket.name} está digitando…`}
          theirSeenAt={chat.theirSeenAt}
        />
      </div>
      <ChatComposer
        value={body}
        onChange={setBody}
        onTyping={chat.markTyping}
        onSend={() => void send("waiting", body.trim())}
        busy={busy}
        placeholder={closed ? "Ticket encerrado. Responder reabre a conversa." : "Escreva a resposta para o cliente…"}
      >
        <Button
          type="button"
          variant="outline"
          disabled={busy || closed}
          onClick={() => void send("closed", body.trim() || "Ticket encerrado. Obrigado pelo contato!")}
        >
          Encerrar ticket
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
          🗑️ Excluir ticket
        </Button>
      </ChatComposer>
    </div>
  );
}
