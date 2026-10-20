import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { deleteTicketAdmin, listTicketsAdmin } from "@/admin/admin-fn";
import { useLivePoll } from "@/lib/use-live-poll";

const STATUS_LABEL: Record<string, string> = {
  open: "🟢 aberto",
  waiting: "⏳ aguardando cliente",
  closed: "🔒 encerrado",
};

export const Route = createFileRoute("/admin/tickets")({ component: TicketsAdmin });

type Row = {
  id: number;
  public_id: string;
  name: string;
  email: string;
  order_id: string | null;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_role?: string | null;
};

function TicketsAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  // When a ticket is open (/admin/tickets/123) this page only hosts it.
  const isChildOpen = useChildMatches().length > 0;

  // Live list: new tickets and customer replies show up without reloading.
  const { pollNow } = useLivePoll(
    async () => {
      if (isChildOpen) return;
      try {
        setRows((await listTicketsAdmin({ data: {} })) as Row[]);
      } catch (e) {
        if (rows.length === 0) toast.error((e as Error).message);
        throw e;
      }
    },
    { fast: 4000, slow: 15000 },
  );
  useEffect(() => {
    if (!isChildOpen) pollNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChildOpen]);

  async function remove(row: Row) {
    if (!window.confirm(`Excluir o ticket ${row.public_id} (${row.subject}) e toda a conversa?`)) return;
    try {
      await deleteTicketAdmin({ data: { id: row.id } });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Ticket excluído.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }

  if (isChildOpen) return <Outlet />;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Tickets</h1>
      <p className="mt-1 text-sm text-muted">Atenda os chamados da loja neste painel.</p>
      <div className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">Nenhum ticket ainda.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-center hover:bg-surface">
              <Link
                to="/admin/tickets/$id"
                params={{ id: String(row.id) }}
                className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.subject}</p>
                  <p className="truncate text-xs text-muted">
                    {row.public_id} · {row.name} · {row.email}
                  </p>
                </div>
                <Badge>
                  {row.status !== "closed" && row.last_role === "customer"
                    ? "🔔 cliente respondeu"
                    : (STATUS_LABEL[row.status] ?? row.status)}
                </Badge>
              </Link>
              <button
                type="button"
                onClick={() => void remove(row)}
                title="Excluir ticket"
                aria-label={`Excluir ticket ${row.public_id}`}
                className="mr-3 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-bg hover:text-red-400"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
