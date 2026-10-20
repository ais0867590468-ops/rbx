import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getSecurityOverview } from "@/admin/admin-fn";

export const Route = createFileRoute("/admin/seguranca")({ component: Seguranca });

type Data = Awaited<ReturnType<typeof getSecurityOverview>>;

const PROTECTIONS = [
  "Assinatura HMAC no webhook de pagamento (comparação em tempo constante)",
  "Limite de requisições por IP e por e-mail no checkout, tickets e webhook",
  "Validação do cartão (Luhn) e número/CVV nunca gravados no banco",
  "Campo isca (honeypot) contra robôs no checkout",
  "Bloqueio de clientes suspeitos direto no módulo do cliente",
  "Cabeçalhos de segurança: HSTS, anti-iframe, nosniff, política de referrer",
  "Painel ADM em app separado, sem nenhuma rota dele dentro da loja",
  "Lista de e-mails permitidos (ADMIN_EMAILS) para entrar na equipe",
  "Trilha de auditoria de toda ação feita no painel",
  "Chaves lidas de variáveis de ambiente, nunca no código",
];

function Seguranca() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    getSecurityOverview()
      .then(setData)
      .catch((e: Error) => toast.error(e.message));
  }, []);

  if (!data) return <div className="h-60 animate-pulse rounded-xl bg-surface" />;
  const okCount = data.checks.filter((c) => c.ok).length;
  const score = Math.round((okCount / data.checks.length) * 100);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Proteção</p>
        <h1 className="font-display text-3xl font-semibold">Segurança</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Estado da proteção da loja e do painel, com o que ainda falta configurar.
        </p>
      </div>

      <Card className="relative overflow-hidden p-6">
        <div className="aurora opacity-30" />
        <div className="relative flex flex-wrap items-center gap-6">
          <div
            className="grid size-24 place-items-center rounded-full font-display text-3xl font-bold"
            style={{
              background: `conic-gradient(${score >= 80 ? "#3dd68c" : "#e0b44a"} ${score * 3.6}deg, #1c2a44 0)`,
            }}
          >
            <span className="grid size-[84px] place-items-center rounded-full bg-surface">{score}%</span>
          </div>
          <div>
            <p className="flex items-center gap-2 font-display text-xl font-semibold">
              {score >= 80 ? <ShieldCheck className="size-5 text-success" /> : <ShieldAlert className="size-5 text-warn" />}
              {score >= 80 ? "Bem protegido" : "Falta configurar"}
            </p>
            <p className="text-sm text-muted">
              {okCount} de {data.checks.length} verificações OK · {data.webhookRejected24h} webhooks recusados em 24h ·{" "}
              {data.blockedCustomers} clientes bloqueados · {data.staffCount} na equipe
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Verificações</h2>
          <ul className="mt-3 space-y-3">
            {data.checks.map((c) => (
              <li key={c.key} className="flex gap-3">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-warn" />
                )}
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  {!c.ok ? <p className="text-xs text-muted">{c.fix}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Proteções ativas no código</h2>
          <ul className="mt-3 space-y-2.5">
            {PROTECTIONS.map((p) => (
              <li key={p} className="flex gap-2.5 text-sm text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
                {p}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold">IPs mais ativos (24h)</h2>
        <p className="text-xs text-faint">Checkouts, erros e webhooks recusados por IP — útil para achar abuso.</p>
        <ul className="mt-3 space-y-2">
          {data.topIps.map((ip) => (
            <li key={ip.ip} className="flex items-center justify-between text-sm">
              <span className="font-mono">{ip.ip}</span>
              <Badge tone={ip.n >= 10 ? "warn" : "line"}>{ip.n} eventos</Badge>
            </li>
          ))}
          {data.topIps.length === 0 ? <li className="text-sm text-muted">Nada suspeito.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
