import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, Globe, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { banIp, listIps, unbanIp } from "@/admin/admin-ext-fn";

export const Route = createFileRoute("/admin/ips")({ component: IpsPage });

type Data = Awaited<ReturnType<typeof listIps>>;

const DURATIONS: Array<[number, string]> = [
  [1, "1 hora"],
  [24, "24 horas"],
  [24 * 7, "7 dias"],
  [24 * 30, "30 dias"],
  [0, "Permanente"],
];

function when(v: string | null) {
  return v ? new Date(v).toLocaleString("pt-BR") : "—";
}

function IpsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(0);

  const load = useCallback(() => {
    listIps()
      .then(setData)
      .catch((e: Error) => toast.error(e.message));
  }, []);

  useEffect(() => load(), [load]);

  async function ban(target: string, why: string, h: number) {
    try {
      await banIp({ data: { ip: target, reason: why, hours: h } });
      toast.success(`IP ${target} banido.`);
      setIp("");
      setReason("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao banir");
    }
  }

  async function unban(target: string) {
    try {
      await unbanIp({ data: { ip: target } });
      toast.success(`IP ${target} liberado.`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Proteção</p>
        <h1 className="font-display text-3xl font-semibold">Gerenciar IPs</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Banir um IP bloqueia checkout, tickets, criação de conta e login vindos dele. Você escolhe o motivo e por
          quanto tempo.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Ban className="size-4 text-warn" /> Banir um IP
        </h2>
        <form
          className="mt-3 grid gap-3 md:grid-cols-[1fr_1.4fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void ban(ip.trim(), reason.trim(), hours);
          }}
        >
          <Input placeholder="Ex.: 177.10.20.30" value={ip} onChange={(e) => setIp(e.target.value)} required />
          <Input placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          <select
            className="h-10 rounded-md border border-line bg-bg px-3 text-sm"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            {DURATIONS.map(([h, label]) => (
              <option key={h} value={h}>
                {label}
              </option>
            ))}
          </select>
          <Button type="submit">Banir IP</Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <ShieldOff className="size-4 text-accent" /> IPs banidos ({data?.banned.length ?? 0})
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="py-2">IP</th>
                <th>Motivo</th>
                <th>Desde</th>
                <th>Expira</th>
                <th>Bloqueios</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.banned.map((b) => (
                <tr key={b.ip}>
                  <td className="py-2.5 font-mono">{b.ip}</td>
                  <td className="text-muted">{b.reason || "—"}</td>
                  <td className="text-xs text-faint">{when(b.created_at)}</td>
                  <td className="text-xs text-faint">{b.expires_at ? when(b.expires_at) : "Nunca"}</td>
                  <td>
                    <Badge tone={b.hits > 0 ? "warn" : "line"}>{b.hits}</Badge>
                  </td>
                  <td className="text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => unban(b.ip)}>
                      Liberar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.banned.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nenhum IP banido.</p>
          ) : null}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Globe className="size-4 text-accent" /> IPs ativos (7 dias)
        </h2>
        <p className="text-xs text-faint">Ordenados por erros e atividade — banir é um clique.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-faint">
              <tr>
                <th className="py-2">IP</th>
                <th>Dispositivo</th>
                <th>Visitas</th>
                <th>Checkouts</th>
                <th>Contas</th>
                <th>Erros</th>
                <th>Última vez</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.active.map((a) => (
                <tr key={a.ip}>
                  <td className="py-2.5 font-mono">{a.ip}</td>
                  <td className="text-xs text-muted">
                    {a.device} · {a.os} · {a.browser}
                  </td>
                  <td className="tabular-nums">{a.visits}</td>
                  <td className="tabular-nums">{a.checkouts}</td>
                  <td className="tabular-nums">{a.accounts}</td>
                  <td>
                    <Badge tone={a.errors > 0 ? "warn" : "line"}>{a.errors}</Badge>
                  </td>
                  <td className="text-xs text-faint">{when(a.last_seen)}</td>
                  <td className="text-right">
                    {a.banned ? (
                      <Badge tone="warn">banido</Badge>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => ban(a.ip, "Banido pela lista de IPs ativos", 0)}
                      >
                        Banir
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
