import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listLogs } from "@/admin/admin-fn";
import { cn } from "@/lib/utils";
import { parseUa } from "@/lib/ua";
import { banIp } from "@/admin/admin-ext-fn";

export const Route = createFileRoute("/admin/logs")({ component: LogsPage });

type Data = Awaited<ReturnType<typeof listLogs>>;

const KINDS: Array<[string, string]> = [
  ["", "Todos"],
  ["visit", "Visitas"],
  ["cart", "Carrinhos abertos"],
  ["checkout_step", "Campos do checkout"],
  ["checkout", "Checkout"],
  ["paid", "Pagamentos"],
  ["customer", "Clientes"],
  ["ticket", "Tickets"],
  ["webhook", "Webhook"],
  ["webhook_rejected", "Webhook recusado"],
  ["error", "Erros"],
  ["audit", "Auditoria"],
  ["account", "Contas / login"],
];

const TONE: Record<string, "line" | "accent" | "success" | "warn"> = {
  paid: "success",
  customer: "accent",
  checkout: "accent",
  cart: "accent",
  checkout_step: "accent",
  error: "warn",
  webhook_rejected: "warn",
  audit: "accent",
};

function pretty(detail: string | null) {
  if (!detail) return null;
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}

function LogsPage() {
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [auto, setAuto] = useState(false);
  const [limit, setLimit] = useState(200);
  const [open, setOpen] = useState<number | null>(null);

  function exportCsv() {
    if (!data) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["id,data,tipo,ip,dispositivo,pagina,detalhe"].concat(
      data.rows.map((r) => {
        const ua = parseUa(r.user_agent);
        return [r.id, r.created_at, r.kind, r.ip, `${ua.device}/${ua.os}/${ua.browser}`, r.path, r.detail].map(esc).join(",");
      }),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `registros-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function ban(ip: string) {
    const reason = window.prompt(`Motivo para banir ${ip} (opcional):`);
    if (reason === null) return;
    try {
      await banIp({ data: { ip, reason, hours: 0 } });
      toast.success(`IP ${ip} banido.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao banir");
    }
  }

  function load(k = kind, query = q) {
    listLogs({ data: { kind: k || undefined, q: query || undefined, limit } })
      .then(setData)
      .catch((e: Error) => toast.error(e.message));
  }

  useEffect(() => {
    const t = setTimeout(() => load(kind, q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, q, limit]);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, kind, q]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Registros</h1>
          <p className="mt-1 text-sm text-muted">
            Trilha completa: visitas, checkouts, pagamentos, webhooks, erros e tudo que a equipe faz no painel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Ao vivo (5s)
          </label>
          <select
            className="h-9 rounded-md border border-line bg-bg px-2 text-xs"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[200, 500, 1000, 2000].map((n) => (
              <option key={n} value={n}>
                últimos {n}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
            Exportar CSV
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw className={cn("size-4", auto && "animate-spin")} /> Atualizar
          </Button>
        </div>
      </div>

      {data ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.stats.map((s) => (
            <span key={s.kind} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs">
              <span className="text-muted">{s.kind}</span>{" "}
              <span className="font-semibold tabular-nums">{s.n}</span>
              <span className="text-faint"> /24h</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Buscar IP, e-mail, pedido…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {KINDS.map(([k, label]) => (
          <button
            key={k || "all"}
            type="button"
            className={cn(
              "h-9 rounded-full border px-3 text-xs transition-colors",
              kind === k ? "border-accent bg-accent/15 text-fg" : "border-line text-muted hover:text-fg",
            )}
            onClick={() => setKind(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        {data?.rows.map((row) => {
          const ua = parseUa(row.user_agent);
          const isOpen = open === row.id;
          return (
            <article key={row.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[row.kind] ?? "line"}>{row.kind}</Badge>
                <span className="text-xs text-muted">{row.path}</span>
                {row.ip ? <span className="font-mono text-[11px] text-faint">{row.ip}</span> : null}
                {row.user_agent ? (
                  <span className="rounded bg-bg px-1.5 py-0.5 text-[11px] text-muted">
                    {ua.device} · {ua.os} · {ua.browser}
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-faint">{new Date(row.created_at).toLocaleString("pt-BR")}</span>
              </div>
              {row.detail ? (
                <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed text-faint">{pretty(row.detail)}</pre>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <button type="button" className="text-accent" onClick={() => setOpen(isOpen ? null : row.id)}>
                  {isOpen ? "Ocultar bruto" : "Ver completo"}
                </button>
                {row.ip && row.ip !== "desconhecido" ? (
                  <>
                    <button type="button" className="text-accent" onClick={() => setQ(row.ip!)}>
                      Filtrar por este IP
                    </button>
                    <button type="button" className="text-warn" onClick={() => ban(row.ip!)}>
                      Banir IP
                    </button>
                  </>
                ) : null}
              </div>
              {isOpen ? (
                <pre className="mt-2 overflow-x-auto rounded bg-bg p-2 text-[11px] text-muted">
                  {JSON.stringify({ id: row.id, kind: row.kind, ip: row.ip, user_agent: row.user_agent, path: row.path, created_at: row.created_at }, null, 2)}
                </pre>
              ) : null}
            </article>
          );
        })}
        {data && data.rows.length === 0 ? <p className="py-10 text-center text-sm text-muted">Nenhum registro.</p> : null}
      </div>
    </div>
  );
}
