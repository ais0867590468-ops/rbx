import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAdminProducts, saveProduct } from "@/admin/admin-fn";
import { brl } from "@/lib/utils";

export const Route = createFileRoute("/admin/catalogo")({ component: AdminProdutos });

type P = {
  id: number;
  name: string;
  robux_amount: number;
  price_cents: number;
  compare_cents: number | null;
  sold_count: number;
  active: boolean;
  badge: string | null;
  sort_order: number;
};

function AdminProdutos() {
  const [rows, setRows] = useState<P[]>([]);

  useEffect(() => {
    listAdminProducts()
      .then((r) => setRows(r as P[]))
      .catch((e: Error) => toast.error(e.message));
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Produtos</h1>
      <div className="mt-6 space-y-3">
        {rows.map((p, idx) => (
          <form
            key={p.id}
            className="grid gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const next = rows[idx];
              await saveProduct({
                data: {
                  id: next.id,
                  name: next.name,
                  robux_amount: next.robux_amount,
                  price_cents: next.price_cents,
                  compare_cents: next.compare_cents,
                  badge: next.badge,
                  active: next.active,
                  sort_order: next.sort_order,
                },
              });
              toast.success("Produto atualizado.");
            }}
          >
            <Input
              value={p.name}
              onChange={(e) => {
                const copy = [...rows];
                copy[idx] = { ...p, name: e.target.value };
                setRows(copy);
              }}
            />
            <Input
              type="number"
              value={p.robux_amount}
              onChange={(e) => {
                const copy = [...rows];
                copy[idx] = { ...p, robux_amount: Number(e.target.value) };
                setRows(copy);
              }}
            />
            <Input
              type="number"
              value={p.price_cents}
              onChange={(e) => {
                const copy = [...rows];
                copy[idx] = { ...p, price_cents: Number(e.target.value) };
                setRows(copy);
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={p.active}
                onChange={(e) => {
                  const copy = [...rows];
                  copy[idx] = { ...p, active: e.target.checked };
                  setRows(copy);
                }}
              />
              Ativo · {brl(p.price_cents)}
            </label>
            <Input
              placeholder="Selo"
              value={p.badge ?? ""}
              onChange={(e) => {
                const copy = [...rows];
                copy[idx] = { ...p, badge: e.target.value || null };
                setRows(copy);
              }}
            />
            <Button type="submit" variant="outline">
              Salvar
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
