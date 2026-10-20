import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { getFunnel } from "@/admin/admin-ext-fn";
import { brl, cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/funil")({ component: FunilPage });

type Data = Awaited<ReturnType<typeof getFunnel>>;

const PERIODS = [1, 7, 30, 90];

function Rank({ title, rows }: { title: string; rows: Array<{ name: string; n: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <li key={r.name} className="text-sm">
            <div className="flex justify-between">
              <span className="truncate text-muted">{r.name}</span>
              <span className="font-medium tabular-nums">{r.n}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-robux transition-all duration-700"
                style={{ width: `${(r.n / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="text-sm text-muted">Sem dados no período.</li> : null}
      </ul>
    </Card>
  );
}

function FunilPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    setData(null);
    getFunnel({ data: { days } })
      .then(setData)
      .catch((e: Error) => toast.error(e.message));
  }, [days]);

  const top = data?.stages[0]?.n || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Análise</p>
          <h1 className="font-display text-3xl font-semibold">Funil e plataformas</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            De onde vêm as pessoas, o que usam e onde elas desistem até pagar.
          </p>
        </div>
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDays(p)}
              className={cn(
                "h-9 rounded-full border px-3 text-xs transition-colors",
                days === p ? "border-accent bg-accent/15 text-fg" : "border-line text-muted hover:text-fg",
              )}
            >
              {p === 1 ? "24h" : `${p} dias`}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="h-72 animate-pulse rounded-xl bg-surface" />
      ) : (
        <>
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Funil de vendas</h2>
            <div className="mt-4 space-y-3">
              {data.stages.map((s, i) => {
                const prev = i === 0 ? s.n : data.stages[i - 1].n;
                const conv = prev > 0 ? Math.round((s.n / prev) * 100) : 0;
                return (
                  <div key={s.key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{s.label}</span>
                      <span className="tabular-nums">
                        {s.n}
                        {i > 0 ? <span className="ml-2 text-xs text-faint">{conv}% da etapa anterior</span> : null}
                      </span>
                    </div>
                    <div className="mt-1 h-7 overflow-hidden rounded-md bg-line">
                      <div
                        className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-accent/70 to-robux px-2 text-[11px] font-semibold text-ink transition-all duration-700"
                        style={{ width: `${Math.max(4, (s.n / top) * 100)}%` }}
                      >
                        {Math.round((s.n / top) * 100)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs text-faint">Receita</p>
                <p className="font-display text-xl font-semibold">{brl(data.revenueCents)}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs text-faint">Pedidos criados</p>
                <p className="font-display text-xl font-semibold">{data.ordersCreated}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs text-faint">PIX / Cartão</p>
                <p className="font-display text-xl font-semibold">
                  {data.pix} / {data.card}
                </p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <p className="text-xs text-faint">Páginas vistas</p>
                <p className="font-display text-xl font-semibold">{data.totalVisits}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-display text-lg font-semibold">Entradas por dia</h2>
              <div className="mt-3 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2a44" vertical={false} />
                    <XAxis dataKey="day" stroke="#6b7a99" fontSize={11} />
                    <YAxis stroke="#6b7a99" fontSize={11} allowDecimals={false} width={30} />
                    <Tooltip contentStyle={{ background: "#0b1224", border: "1px solid #1c2a44", borderRadius: 8 }} />
                    <Bar dataKey="n" name="Visitas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-display text-lg font-semibold">Horário de pico</h2>
              <div className="mt-3 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2a44" vertical={false} />
                    <XAxis dataKey="hour" stroke="#6b7a99" fontSize={11} />
                    <YAxis stroke="#6b7a99" fontSize={11} allowDecimals={false} width={30} />
                    <Tooltip contentStyle={{ background: "#0b1224", border: "1px solid #1c2a44", borderRadius: 8 }} />
                    <Bar dataKey="n" name="Visitas" fill="#e4c15a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Rank title="Origem do tráfego" rows={data.sources} />
            <Rank title="Dispositivo" rows={data.devices} />
            <Rank title="Sistema operacional" rows={data.os} />
            <Rank title="Navegador" rows={data.browsers} />
            <Rank title="Páginas mais vistas" rows={data.pages} />
            <Rank
              title="Pacotes com PIX não pago"
              rows={data.abandoned.map((a) => ({ name: a.product_name, n: a.n }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
