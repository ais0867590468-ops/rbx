import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CreditCard, Globe, Mail, ShieldBan, Ticket, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCustomer, saveCustomer } from "@/admin/admin-fn";
import { brl } from "@/lib/utils";

export const Route = createFileRoute("/admin/cliente/$email")({ component: Cliente });

type Data = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;

const BRAND: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  card: "Cartão",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR");
}

function Cliente() {
  const { email } = Route.useParams();
  const [data, setData] = useState<Data | null | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [vip, setVip] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    getCustomer({ data: { email } })
      .then((d) => {
        setData(d);
        if (d) {
          setNotes(d.customer.notes);
          setTags(d.customer.tags);
          setVip(d.customer.vip);
          setBlocked(d.customer.blocked);
          setReason(d.customer.block_reason ?? "");
        }
      })
      .catch((e: Error) => {
        toast.error(e.message);
        setData(null);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  if (data === undefined) return <div className="h-60 animate-pulse rounded-xl bg-surface" />;
  if (data === null) {
    return (
      <div>
        <Link to="/admin/clientes" className="text-sm text-accent">
          ← Voltar
        </Link>
        <p className="mt-4 text-muted">Cliente não encontrado.</p>
      </div>
    );
  }

  const c = data.customer;
  let usernames: string[] = [];
  try {
    usernames = JSON.parse(c.usernames) as string[];
  } catch {
    usernames = [];
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/clientes" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      <Card className="relative overflow-hidden p-6">
        <div className="aurora opacity-40" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-accent to-robux font-display text-3xl font-bold text-ink">
            {c.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-semibold">{c.name}</h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" />{c.email}</span>
              <span className="inline-flex items-center gap-1.5"><User className="size-3.5" />@{c.roblox_username}</span>
              <span className="inline-flex items-center gap-1.5"><Globe className="size-3.5" />{c.last_ip ?? "—"}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {c.vip ? <Badge tone="warn">VIP</Badge> : null}
              {c.blocked ? <Badge tone="warn">Bloqueado</Badge> : <Badge tone="success">Ativo</Badge>}
              <Badge>cliente desde {new Date(c.created_at).toLocaleDateString("pt-BR")}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ["Pedidos", String(data.orders.length)],
              ["Pagos", String(data.totals.n)],
              ["Total", brl(data.totals.cents)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-bg/70 px-4 py-2 backdrop-blur">
                <p className="font-display text-xl font-semibold tabular-nums">{v}</p>
                <p className="text-xs text-muted">{k}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Pedidos</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-2 font-medium">Pedido</th>
                    <th className="py-2 font-medium">Pacote</th>
                    <th className="py-2 font-medium">Método</th>
                    <th className="py-2 font-medium">Valor</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.id} className="border-t border-line">
                      <td className="py-2.5">
                        <p className="font-mono text-xs">{o.id}</p>
                        <p className="text-[11px] text-faint">{fmt(o.created_at)}</p>
                      </td>
                      <td className="py-2.5">
                        {o.product_name}
                        <p className="text-[11px] text-faint">@{o.roblox_username}</p>
                      </td>
                      <td className="py-2.5 uppercase">
                        {o.payment_method}
                        {o.card_last4 ? <p className="text-[11px] normal-case text-faint">•••• {o.card_last4}</p> : null}
                      </td>
                      <td className="py-2.5 tabular-nums">{brl(o.price_cents)}</td>
                      <td className="py-2.5">
                        <Badge tone={o.status === "delivered" ? "success" : o.status === "paid" ? "accent" : "line"}>
                          {o.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {data.orders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-muted">Sem pedidos.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <CreditCard className="size-4 text-accent" /> Cartões usados
            </h2>
            <p className="mt-1 text-xs text-faint">
              Por segurança (PCI) guardamos só bandeira e final. Número completo e CVV nunca são salvos.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {data.cards.map((card) => (
                <div key={`${card.brand}${card.last4}`} className="rounded-xl border border-line bg-gradient-to-br from-surface to-bg p-4">
                  <p className="text-xs uppercase tracking-wider text-muted">{BRAND[card.brand] ?? card.brand}</p>
                  <p className="mt-2 font-mono text-lg tracking-widest">•••• •••• •••• {card.last4}</p>
                  <p className="mt-2 text-[11px] text-faint">{card.uses} uso(s) · último {fmt(card.last_use)}</p>
                </div>
              ))}
              {data.cards.length === 0 ? <p className="text-sm text-muted">Nenhum cartão usado.</p> : null}
            </div>
            {data.orders.some((o) => o.payer_name || o.payer_cpf) ? (
              <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
                <p className="font-medium text-fg">Pagadores PIX (informados pelo banco)</p>
                {data.orders
                  .filter((o) => o.payer_name || o.payer_cpf)
                  .slice(0, 5)
                  .map((o) => (
                    <p key={o.id}>
                      {o.payer_name ?? "—"} · CPF {o.payer_cpf ?? "—"} · {o.payer_bank ?? "—"}
                    </p>
                  ))}
              </div>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Ticket className="size-4 text-accent" /> Tickets
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.tickets.map((t) => (
                <li key={t.id} className="flex items-center gap-3">
                  <Link to="/admin/tickets/$id" params={{ id: String(t.id) }} className="font-mono text-xs text-accent hover:underline">
                    {t.public_id}
                  </Link>
                  <span className="flex-1 truncate">{t.subject}</span>
                  <Badge>{t.status}</Badge>
                </li>
              ))}
              {data.tickets.length === 0 ? <li className="text-muted">Nenhum ticket.</li> : null}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <h2 className="font-display text-lg font-semibold">Gerenciar</h2>
            <div className="space-y-1.5">
              <Label>Tags (separe por vírgula)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="recorrente, confiável" />
            </div>
            <div className="space-y-1.5">
              <Label>Anotações internas</Label>
              <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} /> Cliente VIP
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
              <ShieldBan className="size-4 text-warn" /> Bloquear novas compras
            </label>
            {blocked ? (
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do bloqueio" />
            ) : null}
            <Button
              type="button"
              className="w-full"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await saveCustomer({
                    data: { email: c.email, notes, tags, vip, blocked, block_reason: blocked ? reason || null : null },
                  });
                  toast.success("Cliente atualizado.");
                  load();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao salvar");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Salvar alterações
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Contas Roblox</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {usernames.map((u) => (
                <Badge key={u} tone="accent">@{u}</Badge>
              ))}
            </div>
            <h2 className="mt-5 font-display text-lg font-semibold">IPs</h2>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {data.ips.map((ip) => (
                <li key={ip.ip} className="flex justify-between">
                  <span className="font-mono">{ip.ip}</span>
                  <span>{ip.n}x · {fmt(ip.last_seen)}</span>
                </li>
              ))}
              {data.ips.length === 0 ? <li>—</li> : null}
            </ul>
            <p className="mt-4 break-words text-[11px] text-faint">{c.last_user_agent}</p>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Linha do tempo</h2>
            <ul className="mt-3 space-y-2">
              {data.timeline.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs">
                  <Badge>{t.kind}</Badge>
                  <span className="flex-1 truncate text-muted">{t.path}</span>
                  <span className="text-faint">{fmt(t.created_at)}</span>
                </li>
              ))}
              {data.timeline.length === 0 ? <li className="text-sm text-muted">Sem eventos.</li> : null}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
