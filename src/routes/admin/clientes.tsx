import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, Search, ShieldBan, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listCustomers } from "@/admin/admin-fn";
import { brl, cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/clientes")({ component: Clientes });

type Row = Awaited<ReturnType<typeof listCustomers>>[number];

const FILTERS = [
  ["", "Todos"],
  ["buyers", "Compradores"],
  ["vip", "VIP"],
  ["blocked", "Bloqueados"],
] as const;

function Clientes() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);

  function load(nextQ = q, nextFilter = filter) {
    listCustomers({ data: { q: nextQ || undefined, filter: nextFilter || undefined } })
      .then(setRows)
      .catch((e: Error) => toast.error(e.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q, filter), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter]);

  const totalSpent = (rows ?? []).reduce((a, r) => a + r.total_cents, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">CRM</p>
          <h1 className="font-display text-3xl font-semibold">Clientes</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Cada pessoa que preenche o checkout vira um módulo automaticamente: dados, contas Roblox,
            cartões usados (só bandeira e final), pedidos, IPs, tickets e histórico.
          </p>
        </div>
        <Card className="flex items-center gap-3 px-4 py-3">
          <Users className="size-5 text-accent" />
          <div>
            <p className="font-display text-xl font-semibold tabular-nums">{rows?.length ?? "…"}</p>
            <p className="text-xs text-muted">{brl(totalSpent)} em compras</p>
          </div>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            className="pl-9"
            placeholder="Buscar nome, e-mail, nick ou IP"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {FILTERS.map(([key, label]) => (
          <button
            key={key || "all"}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "h-9 rounded-full border px-3 text-xs transition-colors",
              filter === key
                ? "border-accent bg-accent/15 text-fg"
                : "border-line text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows === null
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-surface" />
            ))
          : rows.map((c, i) => (
              <Link
                key={c.email}
                to="/admin/cliente/$email"
                params={{ email: c.email }}
                className="hover-lift block rounded-xl border border-line bg-surface p-4"
                style={{ animation: `fade-up 450ms ${Math.min(i, 8) * 40}ms both cubic-bezier(0.22,1,0.36,1)` }}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-robux font-display text-lg font-bold text-ink">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {c.name}
                      {c.vip ? <Crown className="size-3.5 shrink-0 text-robux" /> : null}
                      {c.blocked ? <ShieldBan className="size-3.5 shrink-0 text-warn" /> : null}
                    </p>
                    <p className="truncate text-xs text-muted">{c.email}</p>
                    <p className="truncate text-xs text-faint">@{c.roblox_username ?? "—"}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-bg px-2 py-2">
                    <p className="font-display text-base font-semibold tabular-nums">{c.orders_count}</p>
                    <p className="text-[10px] text-faint">pedidos</p>
                  </div>
                  <div className="rounded-lg bg-bg px-2 py-2">
                    <p className="font-display text-base font-semibold tabular-nums">{c.paid_count}</p>
                    <p className="text-[10px] text-faint">pagos</p>
                  </div>
                  <div className="rounded-lg bg-bg px-2 py-2">
                    <p className="font-display text-base font-semibold tabular-nums">{brl(c.total_cents)}</p>
                    <p className="text-[10px] text-faint">gasto</p>
                  </div>
                </div>
                {c.tags ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.tags
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .map((t) => (
                        <Badge key={t} tone="accent">
                          {t}
                        </Badge>
                      ))}
                  </div>
                ) : null}
              </Link>
            ))}
      </div>
      {rows && rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">
          Nenhum cliente ainda. Quando alguém preencher o checkout, o módulo é criado aqui sozinho.
        </p>
      ) : null}
    </div>
  );
}
