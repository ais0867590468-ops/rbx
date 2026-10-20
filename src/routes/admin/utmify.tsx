import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  Copy,
  Link2,
  Radar,
  RefreshCw,
  Send,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getUtmifyAdmin,
  getUtmifyReport,
  resendUtmifyOrder,
  saveUtmifyConfig,
  syncUtmify,
  testUtmify,
} from "@/admin/admin-utmify-fn";
import { brl, cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/utmify")({ component: UtmifyPage });

type Admin = Awaited<ReturnType<typeof getUtmifyAdmin>>;
type Report = Awaited<ReturnType<typeof getUtmifyReport>>;

const PERIODS = [1, 7, 30, 90];

const TABS = [
  ["geral", "Visão geral"],
  ["origens", "Origens e campanhas"],
  ["pedidos", "Pedidos rastreados"],
  ["links", "Links com UTM"],
  ["config", "Configuração"],
  ["eventos", "Envios à UTMify"],
] as const;
type Tab = (typeof TABS)[number][0];

const DIM_LABELS: Array<[string, string]> = [
  ["source", "Origem (utm_source)"],
  ["medium", "Mídia / conjunto"],
  ["campaign", "Campanha"],
  ["content", "Anúncio / criativo"],
  ["term", "Termo / posicionamento"],
  ["referrer", "Site de referência"],
  ["landing", "Página de entrada"],
  ["clickid", "Click ID (anúncios)"],
  ["device", "Dispositivo"],
  ["language", "Idioma"],
];

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const when = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

function SentBadge({ state }: { state: string }) {
  if (state === "ok") return <Badge tone="success">enviado</Badge>;
  if (state === "falhou") return <Badge tone="warn">falhou</Badge>;
  return <Badge tone="line">não enviado</Badge>;
}

const STATUS_TONE: Record<string, "success" | "warn" | "line" | "accent"> = {
  delivered: "success",
  paid: "success",
  pending: "warn",
  expired: "line",
};

function UtmifyPage() {
  const [tab, setTab] = useState<Tab>("geral");
  const [days, setDays] = useState(7);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [dim, setDim] = useState("source");

  const loadAdmin = useCallback(() => {
    getUtmifyAdmin()
      .then(setAdmin)
      .catch((e: Error) => toast.error(e.message));
  }, []);

  const loadReport = useCallback(() => {
    setReport(null);
    getUtmifyReport({ data: { days } })
      .then(setReport)
      .catch((e: Error) => toast.error(e.message));
  }, [days]);

  useEffect(() => loadAdmin(), [loadAdmin]);
  useEffect(() => loadReport(), [loadReport]);

  const live = Boolean(admin?.enabled && admin.hasToken && admin.pixelId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Marketing</p>
          <h1 className="flex items-center gap-2 font-display text-3xl font-semibold">
            <Radar className="size-7 text-accent" /> UTMify e rastreamento
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Cada visita, checkout e venda é enviada com origem, campanha, anúncio e click id para a UTMify. Aqui você
            vê tudo que foi capturado e confere se os envios chegaram.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={live ? "success" : "warn"}>{live ? "Integração ativa" : "Configuração pendente"}</Badge>
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
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "h-10 shrink-0 border-b-2 px-4 text-sm transition-colors",
              tab === key ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "geral" ? <Overview admin={admin} report={report} go={setTab} /> : null}
      {tab === "origens" ? <Sources report={report} dim={dim} setDim={setDim} /> : null}
      {tab === "pedidos" ? <Orders report={report} reload={() => { loadReport(); loadAdmin(); }} /> : null}
      {tab === "links" ? <LinkBuilder siteUrl={admin?.siteUrl ?? ""} /> : null}
      {tab === "config" ? <Config admin={admin} reload={loadAdmin} /> : null}
      {tab === "eventos" ? <Events report={report} reload={() => { loadReport(); loadAdmin(); }} /> : null}
    </div>
  );
}

/* ───────────────────────── visão geral ───────────────────────── */

function Overview({ admin, report, go }: { admin: Admin | null; report: Report | null; go: (t: Tab) => void }) {
  if (!report || !admin) return <div className="h-72 animate-pulse rounded-xl bg-surface" />;
  const t = report.totals;
  const lowCoverage = t.orders >= 5 && t.withUtmPct < 0.3;
  return (
    <div className="space-y-5">
      {!admin.hasToken || !admin.pixelId ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warn/40 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
            <div>
              <p className="text-sm font-medium">Falta conectar a UTMify</p>
              <p className="text-xs text-muted">
                {!admin.pixelId ? "Pixel ID não informado. " : ""}
                {!admin.hasToken ? "Token da API não informado. " : ""}
                Sem isso os dados são coletados aqui, mas não chegam ao painel da UTMify.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => go("config")}>
            Configurar agora
          </Button>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Visitantes únicos" value={String(t.visitors)} hint={`${t.pageviews} páginas vistas`} />
        <Kpi label="Pedidos criados" value={String(t.orders)} hint={`${t.paid} pagos`} />
        <Kpi label="Receita" value={brl(t.revenue)} hint={`Ticket médio ${brl(t.avgTicket)}`} />
        <Kpi label="Conversão" value={pct(t.conversion)} hint="pagos ÷ visitantes" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Pedidos com origem (UTM / click id)"
          value={pct(t.withUtmPct)}
          hint={lowCoverage ? "Baixo: confira os links dos anúncios (aba Links com UTM)" : "Cobertura de atribuição"}
        />
        <Kpi
          label="Envios à UTMify (7 dias)"
          value={`${admin.health.ok7d} ok · ${admin.health.failed7d} falhas`}
          hint={admin.health.lastOk ? `Último ok: ${when(admin.health.lastOk)}` : "Nenhum envio ainda"}
        />
        <Kpi
          label="Pedidos com dados de rastreio (30 dias)"
          value={`${admin.coverage.tracked}/${admin.coverage.total}`}
          hint="gravados junto ao pedido"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Visitantes e pedidos por dia</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2a44" vertical={false} />
                <XAxis dataKey="day" stroke="#5c6b86" fontSize={11} />
                <YAxis stroke="#5c6b86" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0e1420", border: "1px solid #1c2a44", borderRadius: 8 }} />
                <Area type="monotone" dataKey="visitantes" stroke="#3b82f6" fill="#3b82f633" />
                <Area type="monotone" dataKey="pedidos" stroke="#e4c15a" fill="#e4c15a33" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Receita por dia (R$)</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2a44" vertical={false} />
                <XAxis dataKey="day" stroke="#5c6b86" fontSize={11} />
                <YAxis stroke="#5c6b86" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0e1420", border: "1px solid #1c2a44", borderRadius: 8 }} />
                <Bar dataKey="receita" fill="#3dd68c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <GroupTable title="Melhores origens" rows={report.groups.source.slice(0, 6)} />
    </div>
  );
}

/* ───────────────────────── origens ───────────────────────── */

function GroupTable({ title, rows }: { title: string; rows: Report["groups"][string] }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue), ...rows.map((r) => r.visits));
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="py-2">Nome</th>
              <th>Visitantes</th>
              <th>Pedidos</th>
              <th>Pagos</th>
              <th>Receita</th>
              <th>Conversão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="max-w-[260px] py-2.5">
                  <p className="truncate font-medium" title={r.name}>
                    {r.name}
                  </p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-robux"
                      style={{ width: `${Math.max(3, ((r.revenue || r.visits) / max) * 100)}%` }}
                    />
                  </div>
                </td>
                <td className="tabular-nums">{r.visits}</td>
                <td className="tabular-nums">{r.orders}</td>
                <td className="tabular-nums">{r.paid}</td>
                <td className="tabular-nums">{brl(r.revenue)}</td>
                <td className="tabular-nums text-muted">{r.visits ? pct(r.paid / r.visits) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted">Sem dados no período.</p> : null}
      </div>
    </Card>
  );
}

function Sources({ report, dim, setDim }: { report: Report | null; dim: string; setDim: (d: string) => void }) {
  if (!report) return <div className="h-72 animate-pulse rounded-xl bg-surface" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {DIM_LABELS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setDim(key)}
            className={cn(
              "h-9 rounded-full border px-3 text-xs transition-colors",
              dim === key ? "border-accent bg-accent/15 text-fg" : "border-line text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <GroupTable title={DIM_LABELS.find(([k]) => k === dim)?.[1] ?? ""} rows={report.groups[dim] ?? []} />
      <p className="text-xs text-faint">
        &quot;Visitantes&quot; conta pessoas únicas (id do navegador ou IP). &quot;Pedidos&quot; são pedidos criados com aquele dado e
        &quot;Pagos&quot; os que já foram confirmados.
      </p>
    </div>
  );
}

/* ───────────────────────── pedidos ───────────────────────── */

function Orders({ report, reload }: { report: Report | null; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function resend(orderId: string, status: "waiting_payment" | "paid") {
    setBusy(`${orderId}:${status}`);
    try {
      const res = await resendUtmifyOrder({ data: { orderId, status } });
      if (res.ok) toast.success("Enviado para a UTMify.");
      else toast.error(res.skipped ?? res.error ?? "Falha no envio.");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await syncUtmify();
      toast.success(`Sincronizado: ${res.ok} enviados, ${res.failed} falhas (de ${res.total}).`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncing(false);
    }
  }

  if (!report) return <div className="h-72 animate-pulse rounded-xl bg-surface" />;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Pedidos com dados de rastreio</h2>
          <p className="text-xs text-muted">Tudo que foi capturado em cada pedido e se já chegou à UTMify.</p>
        </div>
        <Button size="sm" variant="outline" disabled={syncing} onClick={sync}>
          <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} /> Sincronizar pendentes
        </Button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="py-2">Pedido</th>
              <th>Produto</th>
              <th>Origem</th>
              <th>Campanha / anúncio</th>
              <th>Click ID</th>
              <th>Dispositivo</th>
              <th>Aguardando</th>
              <th>Pago</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {report.recent.map((o) => (
              <tr key={o.id}>
                <td className="py-2.5">
                  <p className="font-mono text-xs">{o.id}</p>
                  <p className="text-[11px] text-faint">{when(o.created_at)}</p>
                  <Badge tone={STATUS_TONE[o.status] ?? "line"}>{o.status}</Badge>
                </td>
                <td>
                  <p>{o.product}</p>
                  <p className="text-xs text-muted">
                    {brl(o.price_cents)} · {o.method}
                  </p>
                </td>
                <td>
                  <p className="font-medium">{o.source}</p>
                  <p className="text-xs text-muted">{[o.medium, o.referrer].filter(Boolean).join(" · ") || "—"}</p>
                  {o.firstSource && o.firstSource !== o.source ? (
                    <p className="text-[11px] text-faint">1º contato: {o.firstSource}</p>
                  ) : null}
                </td>
                <td className="max-w-[220px]">
                  <p className="truncate" title={o.campaign}>
                    {o.campaign || "—"}
                  </p>
                  <p className="truncate text-xs text-muted" title={o.content}>
                    {[o.content, o.term].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="text-xs text-muted">{o.clickid}</td>
                <td className="text-xs text-muted">
                  {o.ua.device} · {o.ua.os} · {o.ua.browser}
                  <br />
                  {[o.screen, o.language].filter(Boolean).join(" · ")}
                </td>
                <td>
                  <SentBadge state={o.waiting} />
                </td>
                <td>
                  <SentBadge state={o.paidSent} />
                </td>
                <td className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === `${o.id}:waiting_payment`}
                      onClick={() => resend(o.id, "waiting_payment")}
                    >
                      <Send className="size-3" /> Aguardando
                    </Button>
                    {o.status === "paid" || o.status === "delivered" ? (
                      <Button size="sm" disabled={busy === `${o.id}:paid`} onClick={() => resend(o.id, "paid")}>
                        <Send className="size-3" /> Pago
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.recent.length === 0 ? <p className="py-8 text-center text-sm text-muted">Nenhum pedido no período.</p> : null}
      </div>
    </Card>
  );
}

/* ───────────────────────── links com UTM ───────────────────────── */

const TEMPLATES: Array<{ name: string; note: string; query: string }> = [
  {
    name: "Meta Ads (Facebook / Instagram)",
    note: "Cole em “Parâmetros de URL” do anúncio.",
    query:
      "utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}",
  },
  {
    name: "Google Ads",
    note: "Modelo de rastreamento no nível da conta ou campanha.",
    query: "utm_source=google&utm_campaign={campaignid}&utm_medium={adgroupid}&utm_content={creative}&utm_term={keyword}",
  },
  {
    name: "TikTok Ads",
    note: "Confira os parâmetros no gerenciador do TikTok.",
    query:
      "utm_source=TikTok&utm_campaign=__CAMPAIGN_NAME__|__CAMPAIGN_ID__&utm_medium=__AID_NAME__|__AID__&utm_content=__CID_NAME__|__CID__&utm_term=__PLACEMENT__",
  },
];

function LinkBuilder({ siteUrl }: { siteUrl: string }) {
  const [base, setBase] = useState(siteUrl || "https://");
  const [f, setF] = useState({ source: "instagram", medium: "bio", campaign: "", content: "", term: "" });

  const link = useMemo(() => {
    const params = new URLSearchParams();
    if (f.source) params.set("utm_source", f.source);
    if (f.medium) params.set("utm_medium", f.medium);
    if (f.campaign) params.set("utm_campaign", f.campaign);
    if (f.content) params.set("utm_content", f.content);
    if (f.term) params.set("utm_term", f.term);
    const q = params.toString();
    return q ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base;
  }, [base, f]);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado.");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Link2 className="size-4 text-accent" /> Gerador de link rastreado
        </h2>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ub-base">Endereço da loja</Label>
            <Input id="ub-base" value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://sualoja.com" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["source", "Origem (utm_source)", "instagram, tiktok, youtube…"],
                ["medium", "Mídia (utm_medium)", "bio, story, anuncio…"],
                ["campaign", "Campanha (utm_campaign)", "black-friday"],
                ["content", "Anúncio (utm_content)", "video-01"],
                ["term", "Termo (utm_term)", "opcional"],
              ] as const
            ).map(([key, label, ph]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`ub-${key}`}>{label}</Label>
                <Input id={`ub-${key}`} value={f[key]} placeholder={ph} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <p className="break-all rounded-md bg-bg p-3 font-mono text-xs leading-relaxed text-muted">{link}</p>
          <Button type="button" onClick={() => copy(link)}>
            <Copy className="size-4" /> Copiar link
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold">Modelos para anúncios (parâmetros dinâmicos)</h2>
        <p className="mt-1 text-xs text-muted">
          A UTMify lê esses campos para mostrar campanha, conjunto e anúncio com nome e id. Use um modelo por plataforma.
        </p>
        <div className="mt-4 space-y-4">
          {TEMPLATES.map((t) => (
            <div key={t.name} className="rounded-lg border border-line p-3">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-xs text-faint">{t.note}</p>
              <p className="mt-2 break-all rounded-md bg-bg p-2.5 font-mono text-[11px] leading-relaxed text-muted">{t.query}</p>
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => copy(t.query)}>
                <Copy className="size-3.5" /> Copiar parâmetros
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ───────────────────────── configuração ───────────────────────── */

function Config({ admin, reload }: { admin: Admin | null; reload: () => void }) {
  const [form, setForm] = useState({
    enabled: true,
    pixelId: "",
    apiToken: "",
    platform: "RecargasBuxs",
    sendWaiting: true,
    feePercent: "0",
  });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) return;
    setForm((f) => ({
      ...f,
      enabled: admin.enabled,
      pixelId: admin.pixelId,
      platform: admin.platform,
      sendWaiting: admin.sendWaiting,
      feePercent: String(admin.feePercent),
    }));
  }, [admin]);

  if (!admin) return <div className="h-72 animate-pulse rounded-xl bg-surface" />;

  async function save(e: React.FormEvent, clearToken = false) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveUtmifyConfig({
        data: {
          enabled: form.enabled,
          pixelId: form.pixelId.trim(),
          apiToken: form.apiToken.trim() || undefined,
          clearToken,
          platform: form.platform.trim() || "RecargasBuxs",
          sendWaiting: form.sendWaiting,
          feePercent: Number(form.feePercent.replace(",", ".")) || 0,
        },
      });
      toast.success("Configuração salva.");
      setForm((f) => ({ ...f, apiToken: "" }));
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testUtmify();
      const text = res.ok
        ? `Aceito pela UTMify (HTTP ${res.httpStatus}). Pedido de teste ${res.orderId} não é salvo como venda.`
        : `Recusado: ${res.skipped ?? res.error ?? "erro"}${res.httpStatus ? ` (HTTP ${res.httpStatus})` : ""}`;
      setTestResult(text);
      if (res.ok) toast.success("Conexão com a UTMify OK.");
      else toast.error("A UTMify recusou o teste.");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold">Conexão com a UTMify</h2>
        <form onSubmit={(e) => save(e)} className="mt-4 space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="size-4 accent-[var(--color-accent)]"
            />
            Integração ligada (pixel na loja + envio de pedidos)
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="ub-pixel">Pixel ID</Label>
            <Input
              id="ub-pixel"
              value={form.pixelId}
              onChange={(e) => setForm({ ...form, pixelId: e.target.value })}
              placeholder="Copie em UTMify → Integrações → Pixel"
              disabled={admin.pixelFromEnv}
            />
            {admin.pixelFromEnv ? <p className="text-xs text-faint">Definido pela variável UTMIFY_PIXEL_ID.</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ub-token">Token da API</Label>
            <Input
              id="ub-token"
              type="password"
              autoComplete="off"
              value={form.apiToken}
              onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
              placeholder={admin.hasToken ? `Salvo: ${admin.tokenMasked} (deixe vazio para manter)` : "Cole o token da API de credenciais"}
              disabled={admin.tokenFromEnv}
            />
            <p className="text-xs text-faint">
              {admin.tokenFromEnv
                ? "Definido pela variável UTMIFY_API_TOKEN (mais seguro). Para trocar, altere a variável no servidor."
                : "Fica só no servidor e nunca é exibido. O mais seguro é usar a variável UTMIFY_API_TOKEN no Railway/Netlify."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ub-platform">Nome da plataforma</Label>
              <Input id="ub-platform" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ub-fee">Taxa do gateway (%)</Label>
              <Input id="ub-fee" inputMode="decimal" value={form.feePercent} onChange={(e) => setForm({ ...form, feePercent: e.target.value })} />
              <p className="text-xs text-faint">Usada para calcular sua comissão líquida na UTMify.</p>
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.sendWaiting}
              onChange={(e) => setForm({ ...form, sendWaiting: e.target.checked })}
              className="size-4 accent-[var(--color-accent)]"
            />
            Enviar também o pedido &quot;aguardando pagamento&quot; (PIX gerado)
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              Salvar
            </Button>
            <Button type="button" variant="outline" disabled={testing || !admin.hasToken} onClick={test}>
              <Send className="size-4" /> {testing ? "Testando…" : "Enviar pedido de teste"}
            </Button>
            {admin.hasToken && !admin.tokenFromEnv ? (
              <Button type="button" variant="outline" disabled={busy} onClick={(e) => save(e, true)}>
                Remover token
              </Button>
            ) : null}
          </div>
          {testResult ? (
            <p className="rounded-md bg-bg p-3 text-sm text-muted">{testResult}</p>
          ) : null}
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Situação</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {[
              ["Pixel na loja", Boolean(admin.pixelId && admin.enabled)],
              ["Token da API", admin.hasToken],
              ["Pedidos com rastreio (30 dias)", admin.coverage.total === 0 || admin.coverage.tracked > 0],
              ["Sem falhas nos envios (7 dias)", admin.health.failed7d === 0],
            ].map(([label, ok]) => (
              <li key={String(label)} className="flex items-center justify-between gap-3">
                <span className="text-muted">{label}</span>
                {ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-warn" />}
              </li>
            ))}
          </ul>
          {admin.health.lastFailure ? (
            <p className="mt-3 rounded-md bg-bg p-3 text-xs text-warn">
              Última falha: pedido {admin.health.lastFailure.order_id} ({admin.health.lastFailure.status}) —{" "}
              {admin.health.lastFailure.error ?? "erro"}
            </p>
          ) : null}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">O que é coletado</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted">
            <li>UTMs: origem, mídia, campanha, anúncio e termo, além de src e sck.</li>
            <li>Click ids: fbclid (Meta), gclid (Google), ttclid (TikTok), msclkid e Kwai.</li>
            <li>Site de referência, página de entrada e primeiro contato (first touch).</li>
            <li>Id do navegador, idioma, fuso, tela, dispositivo, sistema e navegador.</li>
            <li>IP e user agent (no servidor) e o método de pagamento do pedido.</li>
            <li>CPF e telefone não são enviados à UTMify.</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Como conectar</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted">
            <li>Na UTMify, abra Integrações e copie o Pixel ID.</li>
            <li>Em Integrações → Webhooks → Credenciais de API, crie e copie o token.</li>
            <li>Cole aqui, salve e clique em &quot;Enviar pedido de teste&quot;.</li>
            <li>Use os links da aba &quot;Links com UTM&quot; nos seus anúncios.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────────── eventos ───────────────────────── */

function Events({ report, reload }: { report: Report | null; reload: () => void }) {
  const [syncing, setSyncing] = useState(false);
  if (!report) return <div className="h-72 animate-pulse rounded-xl bg-surface" />;

  async function sync() {
    setSyncing(true);
    try {
      const res = await syncUtmify();
      toast.success(`Sincronizado: ${res.ok} enviados, ${res.failed} falhas (de ${res.total}).`);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Registro de envios à UTMify</h2>
          <p className="text-xs text-muted">Cada tentativa de envio, com o retorno da UTMify.</p>
        </div>
        <Button size="sm" variant="outline" disabled={syncing} onClick={sync}>
          <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} /> Reenviar falhas e pendentes
        </Button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="py-2">Quando</th>
              <th>Pedido</th>
              <th>Evento</th>
              <th>Resultado</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {report.events.map((e) => (
              <tr key={e.id}>
                <td className="py-2.5 text-xs text-muted">{when(e.created_at)}</td>
                <td className="font-mono text-xs">
                  {e.order_id}
                  {e.is_test ? <span className="ml-2 text-faint">(teste)</span> : null}
                </td>
                <td>{e.status}</td>
                <td>
                  <Badge tone={e.ok ? "success" : "warn"}>
                    {e.ok ? "ok" : "falhou"}
                    {e.http_status ? ` · ${e.http_status}` : ""}
                  </Badge>
                </td>
                <td className="max-w-[320px] truncate text-xs text-muted" title={e.error ?? ""}>
                  {e.error ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.events.length === 0 ? <p className="py-8 text-center text-sm text-muted">Nenhum envio ainda.</p> : null}
      </div>
    </Card>
  );
}
