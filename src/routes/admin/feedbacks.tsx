import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, EyeOff, Pencil, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deleteFeedback,
  listFeedbackAdmin,
  saveFeedback,
  setFeedbackStatus,
  type FeedbackRow,
} from "@/admin/admin-feedback-fn";

export const Route = createFileRoute("/admin/feedbacks")({ component: FeedbacksPage });

type Status = "approved" | "pending" | "hidden";

const STATUS_LABEL: Record<Status, string> = {
  approved: "No ar",
  pending: "Aguardando",
  hidden: "Oculto",
};

function when(v: string) {
  return new Date(v).toLocaleString("pt-BR");
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-3.5 ${n <= value ? "fill-robux text-robux" : "text-line"}`} />
      ))}
    </span>
  );
}

const EMPTY = { id: undefined as number | undefined, name: "", rating: 5, message: "", robux: "", status: "approved" as Status };

function FeedbacksPage() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listFeedbackAdmin()
      .then(setRows)
      .catch((e: Error) => toast.error(e.message));
  }, []);

  useEffect(() => load(), [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveFeedback({
        data: {
          id: form.id,
          name: form.name,
          rating: form.rating,
          message: form.message,
          robuxAmount: form.robux ? Number(form.robux) : null,
          status: form.status,
        },
      });
      toast.success(form.id ? "Feedback atualizado." : "Feedback adicionado.");
      setForm(EMPTY);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function status(id: number, next: Status) {
    try {
      await setFeedbackStatus({ data: { id, status: next } });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Excluir este feedback?")) return;
    try {
      await deleteFeedback({ data: { id } });
      toast.success("Feedback excluído.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  const pending = rows?.filter((r) => r.status === "pending").length ?? 0;
  const live = rows?.filter((r) => r.status === "approved").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Prova social</p>
        <h1 className="font-display text-3xl font-semibold">Feedbacks</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Os feedbacks &quot;No ar&quot; passam na faixa de depoimentos das páginas do produto e do checkout. Cadastre aqui
          mensagens reais de clientes (WhatsApp, Discord, tickets) e aprove os que chegam pelo site depois da compra.
          Use só depoimentos verdadeiros — avaliação inventada é proibida pelo Código de Defesa do Consumidor e
          derruba a confiança da loja.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-faint">No ar</p>
          <p className="font-display text-3xl font-semibold">{live}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-faint">Aguardando aprovação</p>
          <p className="font-display text-3xl font-semibold text-warn">{pending}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-faint">Total</p>
          <p className="font-display text-3xl font-semibold">{rows?.length ?? 0}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold">{form.id ? "Editar feedback" : "Adicionar feedback real"}</h2>
        <form onSubmit={save} className="mt-3 grid gap-3 md:grid-cols-[1fr_9rem_9rem_9rem]">
          <Input
            placeholder="Nome (ex.: Lucas)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={40}
            required
          />
          <Input
            type="number"
            min={0}
            placeholder="Robux (opcional)"
            value={form.robux}
            onChange={(e) => setForm({ ...form, robux: e.target.value })}
          />
          <select
            className="h-10 rounded-md border border-line bg-bg px-3 text-sm"
            value={form.rating}
            onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
            aria-label="Nota"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} estrela{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-line bg-bg px-3 text-sm"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
            aria-label="Situação"
          >
            <option value="approved">No ar</option>
            <option value="pending">Aguardando</option>
            <option value="hidden">Oculto</option>
          </select>
          <textarea
            className="min-h-20 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent md:col-span-4"
            placeholder="Mensagem do cliente (até 280 caracteres)"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            maxLength={280}
            required
          />
          <div className="flex gap-2 md:col-span-4">
            <Button type="submit" disabled={busy}>
              {form.id ? "Salvar alterações" : "Adicionar"}
            </Button>
            {form.id ? (
              <Button type="button" variant="outline" onClick={() => setForm(EMPTY)}>
                Cancelar
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold">Todos os feedbacks</h2>
        <div className="mt-3 divide-y divide-line">
          {rows?.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Stars value={r.rating} />
                  <Badge tone={r.status === "approved" ? "success" : r.status === "pending" ? "warn" : "line"}>
                    {STATUS_LABEL[r.status as Status] ?? r.status}
                  </Badge>
                  <Badge tone="line">{r.source === "customer" ? "enviado pelo cliente" : "cadastrado por você"}</Badge>
                </div>
                <p className="text-sm text-muted">“{r.message}”</p>
                <p className="text-xs text-faint">
                  {when(r.created_at)}
                  {r.robux_amount ? ` · ${r.robux_amount.toLocaleString("pt-BR")} Robux` : ""}
                  {r.order_id ? ` · pedido ${r.order_id}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {r.status !== "approved" ? (
                  <Button type="button" size="sm" onClick={() => status(r.id, "approved")}>
                    <Check className="size-3.5" /> Aprovar
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => status(r.id, "hidden")}>
                    <EyeOff className="size-3.5" /> Ocultar
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm({
                      id: r.id,
                      name: r.name,
                      rating: r.rating,
                      message: r.message,
                      robux: r.robux_amount ? String(r.robux_amount) : "",
                      status: r.status as Status,
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <Pencil className="size-3.5" /> Editar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => remove(r.id)}>
                  <Trash2 className="size-3.5" /> Excluir
                </Button>
              </div>
            </div>
          ))}
          {rows && rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              Nenhum feedback ainda. Adicione o primeiro acima — a faixa só aparece na loja quando houver feedback no ar.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
