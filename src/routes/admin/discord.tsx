import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  connectDiscord,
  getAdminSettings,
  loadDiscordChannels,
  loadDiscordGuilds,
  saveAdminSettings,
} from "@/admin/admin-fn";
import {
  getDiscordOps,
  runGatewayCheck,
  saveDiscordPublicKey,
  sendDiscordSample,
  sendGatewayStatus,
  sendReportNow,
  sendReportPanel,
} from "@/admin/admin-discord-fn";

export const Route = createFileRoute("/admin/discord")({ component: DiscordPage });

type Kind =
  | "visits"
  | "cart"
  | "checkout"
  | "pix"
  | "card"
  | "paid"
  | "customers"
  | "tickets"
  | "errors"
  | "gateway"
  | "audit";

/** [settings key, log type, label, what arrives in the channel] */
const CHANNELS: ReadonlyArray<readonly [string, Kind, string, string]> = [
  ["discord_channel_visits", "visits", "👁️ Entrada / visitas", "toda pessoa que chega no site: aparelho, IP, origem, campanha, retorno"],
  ["discord_channel_cart", "cart", "🛍️ Carrinho aberto", "assim que alguém clica num pacote (sem canal próprio, usa Checkout)"],
  ["discord_channel_checkout", "checkout", "🛒 Checkout", "uma mensagem a cada campo preenchido, com progresso"],
  ["discord_channel_pix", "pix", "💠 PIX gerado", "QR Code criado: valor, cliente, expiração, tempo do gateway"],
  ["discord_channel_card", "card", "💳 Cartão processado", "cartão enviado ao gateway (só bandeira e 4 últimos dígitos)"],
  ["discord_channel_paid", "paid", "💰 Vendas confirmadas", "venda paga: pagador, histórico do cliente, vendas do dia"],
  ["discord_channel_customers", "customers", "👤 Novos clientes e contas", "primeiro checkout e contas criadas"],
  ["discord_channel_tickets", "tickets", "🎧 Suporte e feedbacks", "tickets novos e respostas do cliente, com botões Responder e Encerrar para atender direto no Discord"],
  ["discord_channel_errors", "errors", "🚨 Erros e segurança", "falhas de pagamento, bloqueios, webhooks recusados"],
  ["discord_channel_gateway", "gateway", "⚙️ Status do gateway", "alerta quando PIX ou cartão caem / voltam (sem canal próprio, usa Erros)"],
  ["discord_channel_audit", "audit", "🛡️ Auditoria do painel", "ações da equipe no painel"],
];

const REPORT_KEY = "discord_channel_report";

type MethodHealth = {
  status: "online" | "unstable" | "offline" | "unknown";
  lastLatencyMs: number | null;
  ok24h: number;
  fail24h: number;
  lastDetail: string | null;
};
type Health = { pix: MethodHealth; card: MethodHealth };

const STATUS_LABEL: Record<MethodHealth["status"], string> = {
  online: "🟢 ONLINE",
  unstable: "🟡 INSTÁVEL",
  offline: "🔴 OFFLINE",
  unknown: "⚪ SEM DADOS RECENTES",
};

async function act(fn: () => Promise<unknown>, okMessage: string) {
  try {
    await fn();
    toast.success(okMessage);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
  }
}

function ChannelSelect({
  value,
  channels,
  onChange,
}: {
  value: string;
  channels: Array<{ id: string; name: string }>;
  onChange: (id: string) => void;
}) {
  return (
    <select
      className="h-11 flex-1 rounded-md border border-line bg-surface px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>
          #{c.name}
        </option>
      ))}
    </select>
  );
}

function DiscordPage() {
  const [token, setToken] = useState("");
  const [masked, setMasked] = useState("");
  const [invite, setInvite] = useState("");
  const [botName, setBotName] = useState("");
  const [guilds, setGuilds] = useState<Array<{ id: string; name: string }>>([]);
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [guildId, setGuildId] = useState("");
  const [map, setMap] = useState<Record<string, string>>({});
  const [publicKey, setPublicKey] = useState("");
  const [hasPublicKey, setHasPublicKey] = useState(false);
  const [keyFromEnv, setKeyFromEnv] = useState(false);
  const [interactionsUrl, setInteractionsUrl] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState("");

  async function hydrate() {
    const s = await getAdminSettings();
    setMasked(s.discord_bot_token_masked);
    setGuildId(s.discord_guild_id);
    const next: Record<string, string> = { [REPORT_KEY]: s.discord_channel_report };
    for (const [key] of CHANNELS) next[key] = (s as unknown as Record<string, string>)[key] ?? "";
    setMap(next);
    if (s.discord_invite_saved) setInvite(s.discord_invite_saved);
    if (s.hasDiscordToken) {
      try {
        const d = await loadDiscordGuilds();
        setBotName(d.bot?.username ?? "");
        setInvite(d.inviteUrl);
        setGuilds(d.guilds);
        setChannels(d.channels);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao ler o bot");
      }
    }
    const ops = await getDiscordOps();
    setHasPublicKey(ops.hasPublicKey);
    setKeyFromEnv(ops.publicKeyFromEnv);
    setInteractionsUrl(ops.interactionsUrl);
    setHealth(ops.health);
  }

  useEffect(() => {
    hydrate().catch((e: Error) => toast.error(e.message));
  }, []);

  async function withBusy(name: string, fn: () => Promise<unknown>, okMessage: string) {
    setBusy(name);
    await act(fn, okMessage);
    setBusy("");
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Bot Discord</h1>
        <p className="mt-2 text-sm text-muted">
          Cole o token do bot, convide para o servidor e escolha um canal para cada tipo de log. Cada tipo
          chega com cor e layout próprios. Use <strong>Enviar exemplo</strong> para ver como fica.
        </p>
      </div>

      <Card className="space-y-3 p-5">
        <Label>Token do bot</Label>
        <Input
          type="password"
          placeholder={masked || "Cole o token"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <Button
          type="button"
          onClick={() =>
            act(async () => {
              const res = await connectDiscord({ data: { token } });
              setBotName(res.username);
              setInvite(res.inviteUrl);
              setGuilds(res.guilds);
              setToken("");
            }, "Bot conectado.")
          }
        >
          Ligar bot
        </Button>
        {botName ? <p className="text-sm text-success">● Conectado como {botName}.</p> : null}
        {invite ? (
          <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/10 p-3">
            <p className="text-xs text-muted">
              Passo 2: convide o bot para o seu servidor. O link fica salvo aqui.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={invite}
                target="_blank"
                rel="noreferrer"
                className="btn-shine inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-on-accent transition-transform hover:scale-105"
              >
                Convidar bot no servidor
              </a>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(invite);
                  toast.success("Link de convite copiado.");
                }}
              >
                Copiar link
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await saveAdminSettings({ data: { discord_guild_id: guildId } });
                  await hydrate();
                  toast.success("Atualizado. Se o servidor apareceu na lista, selecione abaixo.");
                }}
              >
                Já convidei, atualizar
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5">
        <div className="space-y-1.5">
          <Label>Servidor</Label>
          <select
            className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm"
            value={guildId}
            onChange={async (e) => {
              const id = e.target.value;
              setGuildId(id);
              if (!id) return;
              const ch = await loadDiscordChannels({ data: { guildId: id } });
              setChannels(ch);
            }}
          >
            <option value="">Selecione depois de convidar</option>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {CHANNELS.map(([key, kind, label, hint]) => (
          <div key={key} className="space-y-1.5">
            <Label>{label}</Label>
            <p className="text-xs text-faint">{hint}</p>
            <div className="flex gap-2">
              <ChannelSelect
                value={map[key] ?? ""}
                channels={channels}
                onChange={(id) => setMap({ ...map, [key]: id })}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!map[key] || busy === `sample:${kind}`}
                onClick={() =>
                  withBusy(
                    `sample:${kind}`,
                    () => sendDiscordSample({ data: { kind, channelId: map[key] } }),
                    "Exemplo enviado.",
                  )
                }
              >
                Enviar exemplo
              </Button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() =>
              act(
                () => saveAdminSettings({ data: { ...map, discord_guild_id: guildId } }),
                "Tudo salvo: servidor e canais.",
              )
            }
          >
            Salvar tudo
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy === "all"}
            onClick={async () => {
              setBusy("all");
              let sent = 0;
              for (const [key, kind, label] of CHANNELS) {
                if (!map[key]) continue;
                try {
                  await sendDiscordSample({ data: { kind, channelId: map[key] } });
                  sent += 1;
                } catch (e) {
                  toast.error(`${label}: ${e instanceof Error ? e.message : "falhou"}`);
                }
              }
              setBusy("");
              toast.success(`${sent} exemplo(s) enviado(s).`);
            }}
          >
            Enviar exemplo em todos
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-display text-xl font-semibold">📊 Painel de relatórios (botão Solicitar)</h2>
          <p className="mt-1 text-sm text-muted">
            Posta no canal um painel com botões. Quem clicar recebe na hora um relatório completo: entradas,
            carrinhos, checkouts, PIX e cartão gerados, vendas, faturamento, origens, suporte e status dos
            pagamentos.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Canal do painel</Label>
          <div className="flex gap-2">
            <ChannelSelect
              value={map[REPORT_KEY] ?? ""}
              channels={channels}
              onChange={(id) => setMap({ ...map, [REPORT_KEY]: id })}
            />
            <Button
              type="button"
              disabled={!map[REPORT_KEY] || busy === "panel"}
              onClick={() =>
                withBusy(
                  "panel",
                  async () => {
                    const r = await sendReportPanel({ data: { channelId: map[REPORT_KEY] } });
                    if (!r.buttonsWork) {
                      toast.warning("Painel enviado, mas os botões só funcionam depois de salvar a Public Key abaixo.");
                    }
                  },
                  "Painel enviado no canal.",
                )
              }
            >
              Enviar painel no canal
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Enviar relatório agora:</span>
          {(
            [
              ["today", "Hoje"],
              ["7d", "7 dias"],
              ["30d", "30 dias"],
            ] as const
          ).map(([period, label]) => (
            <Button
              key={period}
              type="button"
              variant="outline"
              disabled={!map[REPORT_KEY] || busy === `report:${period}`}
              onClick={() =>
                withBusy(
                  `report:${period}`,
                  () => sendReportNow({ data: { channelId: map[REPORT_KEY], period } }),
                  "Relatório enviado.",
                )
              }
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">
            Para os botões funcionarem {hasPublicKey ? "✅ chave salva" : "⚠️ falta a Public Key"}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>
              Abra o <strong>Discord Developer Portal</strong> → seu aplicativo → <strong>General Information</strong>.
            </li>
            <li>
              Copie a <strong>Public Key</strong> e cole abaixo.
            </li>
            <li>
              Em <strong>Interactions Endpoint URL</strong>, cole o endereço abaixo e clique em Save Changes (o
              Discord testa na hora).
            </li>
            <li>
              Volte aqui e clique em <strong>Enviar painel no canal</strong>.
            </li>
          </ol>
          <div className="space-y-1.5">
            <Label>Interactions Endpoint URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={interactionsUrl} />
              <Button
                type="button"
                variant="outline"
                disabled={!interactionsUrl}
                onClick={async () => {
                  await navigator.clipboard.writeText(interactionsUrl);
                  toast.success("Endereço copiado.");
                }}
              >
                Copiar
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Public Key do aplicativo</Label>
            <div className="flex gap-2">
              <Input
                placeholder={keyFromEnv ? "definida por variável de ambiente" : hasPublicKey ? "•••• salva (cole outra para trocar)" : "64 letras e números"}
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                autoComplete="off"
              />
              <Button
                type="button"
                disabled={!publicKey.trim() || busy === "key"}
                onClick={() =>
                  withBusy(
                    "key",
                    async () => {
                      await saveDiscordPublicKey({ data: { publicKey } });
                      setPublicKey("");
                      setHasPublicKey(true);
                    },
                    "Public Key salva.",
                  )
                }
              >
                Salvar chave
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-display text-xl font-semibold">⚙️ Status do gateway (PIX e cartão)</h2>
          <p className="mt-1 text-sm text-muted">
            O status vem das tentativas reais dos clientes e das verificações manuais. Se o PIX ou o cartão
            cair, o bot avisa no canal de status; quando voltar, avisa de novo.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["💠 Gerador PIX", health?.pix],
              ["💳 Pagamento por cartão", health?.card],
            ] as const
          ).map(([label, h]) => (
            <div key={label} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-xs text-muted">{label}</p>
              <p className="mt-1 text-lg font-semibold">{h ? STATUS_LABEL[h.status] : "…"}</p>
              {h ? (
                <p className="mt-1 text-xs text-faint">
                  {h.ok24h + h.fail24h
                    ? `${h.ok24h} ok · ${h.fail24h} falha(s) em 24h`
                    : "nenhuma tentativa em 24h"}
                  {h.lastLatencyMs != null ? ` · ${h.lastLatencyMs} ms` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy === "check"}
            onClick={() =>
              withBusy(
                "check",
                async () => {
                  const r = await runGatewayCheck();
                  setHealth(r.health);
                  if (!r.configured) throw new Error("Configure a chave do gateway em Configurações primeiro.");
                  if (!r.ok) throw new Error(`Gateway com problema: ${r.detail ?? "sem resposta"}`);
                },
                "Gateway respondendo normalmente.",
              )
            }
          >
            Verificar agora
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!(map.discord_channel_gateway || map.discord_channel_errors) || busy === "gwsend"}
            onClick={() =>
              withBusy(
                "gwsend",
                () =>
                  sendGatewayStatus({
                    data: { channelId: map.discord_channel_gateway || map.discord_channel_errors },
                  }),
                "Status enviado ao canal.",
              )
            }
          >
            Enviar status ao canal
          </Button>
        </div>
      </Card>
    </div>
  );
}
