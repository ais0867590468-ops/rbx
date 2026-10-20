import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Eye,
  Headset,
  Hourglass,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDashboard } from "@/admin/admin-fn";
import { brl } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

type Dash = Awaited<ReturnType<typeof getDashboard>>;

const STATUS_COLORS: Record<string, string> = {
  delivered: "#3dd68c",
  paid: "#3b82f6",
  pending: "#e0b44a",
  expired: "#5c6b86",
};

function lastDays(series: Dash["series"]) {
  const map = new Map(series.map((row) => [row.day, row]));
  const days: Array<{ day: string; label: string; total: number; count: number }> = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key);
    days.push({
      day: key,
      label: key.slice(8) + "/" + key.slice(5, 7),
      total: (row?.total ?? 0) / 100,
      count: row?.count ?? 0,
    });
  }
  return days;
}

const KIND_LABEL: Record<string, string> = {
  checkout: "Checkout",
  paid: "Pagamento",
  ticket: "Ticket",
  customer: "Cliente novo",
  audit: "Ação da equipe",
  webhook: "Webhook",
  error: "Erro",
  webhook_rejected: "Webhook recusado",
};

function AdminHome() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-accent">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-xl bg-surface" />;

  const days = lastDays(data.series);
  const cards = [
    { k: "Vendido hoje", v: brl(data.revenueTodayCents), hint: `${data.paidToday} pedidos`, icon: Banknote, tone: "text-success" },
    { k: "Receita total", v: brl(data.revenueCents), hint: `${data.paidCount} pagos`, icon: TrendingUp, tone: "text-accent" },
    { k: "Ticket médio", v: brl(data.avgTicketCents), hint: `${data.conversionPct}% de conversão`, icon: Receipt, tone: "text-robux" },
    { k: "PIX em aberto", v: String(data.pendingCount), hint: "aguardando pagamento", icon: Hourglass, tone: "text-warn" },
    { k: "Clientes", v: String(data.customersCount), hint: `${data.vipCount} VIP · ${data.blockedCount} bloqueados`, icon: Users, tone: "text-accent" },
    { k: "Tickets", v: String(data.openTickets), hint: "precisam de resposta", icon: Headset, tone: "text-robux" },
    { k: "Visitas 24h", v: String(data.visits24h), hint: "entradas na loja", icon: Eye, tone: "text-accent" },
    { k: "Alertas 24h", v: String(data.errors24h), hint: "erros e webhooks recusados", icon: AlertTriangle, tone: data.errors24h > 0 ? "text-warn" : "text-success" },
  ];
  const pie = data.byStatus.map((s) => ({ name: s.status, value: s.n }));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Vendas</p>
          <h1 className="font-display text-3xl font-semibold">Painel da loja</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Receita, clientes, pedidos, segurança e atendimento em tempo real.
          </p>
        </div>
        <div className="flex gap-3 text-sm font-medium text-accent">
          <Link to="/admin/pedidos">Pedidos</Link>
          <Link to="/admin/clientes">Clientes</Link>
          <Link to="/admin/seguranca">Segurança</Link>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <Card
            key={c.k}
            className="hover-lift reveal is-visible p-4"
            style={{ animation: `fade-up 500ms ${i * 60}ms both cubic-bezier(0.22,1,0.36,1)` }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">{c.k}</p>
              <c.icon className={`size-4 ${c.tone}`} />
            </div>
            <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{c.v}</p>
            <p className="mt-1 text-xs text-faint">{c.hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Últimos 14 dias</h2>
            <p className="text-xs text-faint">Receita de pedidos pagos (R$)</p>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days} margin={{ left: -12, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1c2a44" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#5c6b86", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#5c6b86", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#0e1420", border: "1px solid #1c2a44", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [brl(Math.round(v * 100)), "Receita"]}
                />
                <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-xl font-semibold">Pedidos por status</h2>
          <div className="mt-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={46} outerRadius={70} paddingAngle={3} stroke="none">
                  {pie.map((p) => (
                    <Cell key={p.name} fill={STATUS_COLORS[p.name] ?? "#8b9bb8"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0e1420", border: "1px solid #1c2a44", borderRadius: 10, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {pie.map((p) => (
              <span key={p.name} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[p.name] ?? "#8b9bb8" }} />
                {p.name} · {p.value}
              </span>
            ))}
            {pie.length === 0 ? <span>Sem pedidos ainda.</span> : null}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Mais vendidos</h2>
          <ul className="mt-3 space-y-2.5">
            {data.topProducts.map((p, i) => (
              <li key={p.name} className="flex items-center gap-3 text-sm">
                <span className="grid size-6 place-items-center rounded-md bg-accent/15 text-xs font-semibold text-accent">{i + 1}</span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="tabular-nums text-muted">{p.n}x</span>
                <span className="tabular-nums text-faint">{brl(p.total)}</span>
              </li>
            ))}
            {data.topProducts.length === 0 ? <li className="text-sm text-muted">Sem vendas ainda.</li> : null}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Métodos de pagamento</h2>
          <ul className="mt-3 space-y-3">
            {data.byMethod.map((m) => {
              const totalN = data.byMethod.reduce((a, b) => a + b.n, 0) || 1;
              return (
                <li key={m.method} className="text-sm">
                  <div className="flex justify-between">
                    <span className="uppercase">{m.method}</span>
                    <span className="tabular-nums text-muted">{m.n} · {brl(m.total)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent to-robux" style={{ width: `${(m.n / totalN) * 100}%` }} />
                  </div>
                </li>
              );
            })}
            {data.byMethod.length === 0 ? <li className="text-sm text-muted">Sem dados.</li> : null}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Activity className="size-4 text-accent" /> Atividade
          </h2>
          <ul className="mt-3 space-y-2">
            {data.activity.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-xs">
                <Badge>{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                <span className="flex-1 truncate text-muted">{a.path}</span>
                <span className="text-faint">{new Date(a.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
            {data.activity.length === 0 ? <li className="text-sm text-muted">Nada por aqui ainda.</li> : null}
          </ul>
        </Card>
      </div>

      <h2 className="mt-10 font-display text-xl font-semibold">Pedidos recentes</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-surface text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Pedido</th>
              <th className="px-4 py-3 font-medium">Nick</th>
              <th className="px-4 py-3 font-medium">Pacote</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-muted" colSpan={5}>
                  Nenhum pedido ainda. As vendas da loja aparecem aqui.
                </td>
              </tr>
            ) : (
              data.recent.map((row) => (
                <tr key={row.id} className="border-t border-line transition-colors hover:bg-surface/60">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link to="/admin/pedidos" className="hover:underline">
                      {row.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{row.roblox_username}</td>
                  <td className="px-4 py-3">{row.product_name}</td>
                  <td className="px-4 py-3 tabular-nums">{brl(row.price_cents)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.status === "paid" || row.status === "delivered" ? "success" : "warn"}>
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
