import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listOrders, markDelivered } from "@/admin/admin-fn";
import { brl } from "@/lib/utils";

export const Route = createFileRoute("/admin/pedidos")({ component: Pedidos });

type Row = {
  id: string;
  product_name: string;
  robux_amount: number;
  price_cents: number;
  roblox_username: string;
  customer_name: string;
  customer_email: string;
  status: string;
  paid_at: string | null;
  created_at: string;
};

function Pedidos() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  function load() {
    listOrders({ data: { q: q || undefined, status: status || undefined } })
      .then((r) => setRows(r as Row[]))
      .catch((e: Error) => toast.error(e.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Pedidos</h1>
      <div className="mt-6 flex flex-wrap gap-2">
        <Input
          placeholder="Buscar nick, e-mail ou código"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <select
          className="h-11 rounded-md border border-line bg-surface px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="pending">pending</option>
          <option value="paid">paid</option>
          <option value="delivered">delivered</option>
          <option value="expired">expired</option>
        </select>
        <Button type="button" variant="outline" onClick={load}>
          Filtrar
        </Button>
      </div>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-surface text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Pedido</th>
              <th className="px-4 py-3 font-medium">Conta / cliente</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <p className="font-mono text-xs">{row.id}</p>
                  <p className="text-xs text-muted">{row.product_name}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{row.roblox_username}</p>
                  <p className="text-xs text-muted">
                    {row.customer_name} · {row.customer_email}
                  </p>
                </td>
                <td className="px-4 py-3 tabular-nums">{brl(row.price_cents)}</td>
                <td className="px-4 py-3">
                  <Badge tone={row.status === "delivered" ? "success" : row.status === "paid" ? "accent" : "line"}>
                    {row.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {row.status === "paid" ? (
                    <Button
                      size="sm"
                      type="button"
                      onClick={async () => {
                        await markDelivered({ data: { id: row.id } });
                        toast.success("Marcado como entregue.");
                        load();
                      }}
                    >
                      Entregar
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
