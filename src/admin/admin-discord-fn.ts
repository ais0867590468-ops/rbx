import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/customers";
import { postMessage, styleEmbed, type LogKind } from "@/lib/discord";
import { gatewayStatusEmbed, reportPanelComponents, reportPanelEmbed, sampleEmbed } from "@/lib/discord-logs";
import { buildReport } from "@/lib/discord-report";
import { getGatewayHealth, runGatewayProbe } from "@/lib/gateway-health";
import { getPublicOrigin } from "@/lib/request-meta";
import { getSettings, settingFromEnv, setSettings } from "@/lib/settings";
import { requireStaff } from "@/lib/staff";

const KINDS = [
  "visits",
  "cart",
  "checkout",
  "pix",
  "card",
  "paid",
  "tickets",
  "errors",
  "customers",
  "audit",
  "gateway",
  "report",
] as const satisfies readonly LogKind[];

const channelId = z.string().trim().regex(/^\d{15,25}$/, "Escolha um canal válido.");

async function botContext(userId: string) {
  await requireStaff(userId);
  const settings = await getSettings();
  const token = settings.discord_bot_token.trim();
  if (!token) throw new Error("Conecte o bot do Discord primeiro.");
  return { settings, token };
}

/** Discord rejects the first message only when the bot lacks access: explain it in plain words. */
async function send(
  token: string,
  channel: string,
  payload: Parameters<typeof postMessage>[2],
  what: string,
) {
  try {
    await postMessage(token, channel, payload, 12_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido";
    if (/Missing Access|Missing Permissions|Unknown Channel/i.test(msg)) {
      throw new Error(
        `O bot não consegue escrever nesse canal (${msg}). Dê ao bot as permissões "Ver canal", "Enviar mensagens" e "Incorporar links" nele.`,
      );
    }
    throw new Error(`Não foi possível enviar ${what}: ${msg}`);
  }
}

/** Everything the Discord page needs: gateway health, interactions URL, key status. */
export const getDiscordOps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const settings = await getSettings();
    const origin = getPublicOrigin();
    return {
      interactionsUrl: origin ? `${origin}/api/discord/interactions` : "",
      hasPublicKey: /^[0-9a-f]{64}$/i.test(settings.discord_public_key.trim()),
      publicKeyFromEnv: Boolean(settingFromEnv("discord_public_key")),
      hasBotToken: Boolean(settings.discord_bot_token.trim()),
      reportChannel: settings.discord_channel_report,
      health: await getGatewayHealth(),
    };
  });

export const saveDiscordPublicKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ publicKey: z.string() }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const key = data.publicKey.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key)) {
      throw new Error(
        "Chave inválida. A Public Key do Discord tem 64 letras/números (0-9 e a-f). Copie em Developer Portal → seu app → General Information.",
      );
    }
    await setSettings({ discord_public_key: key });
    await logAudit(context.userId, "discord.public_key_salva");
    return { ok: true };
  });

/** Posts the "Painel de relatórios" (embed + buttons) in the chosen channel. */
export const sendReportPanel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ channelId }))
  .handler(async ({ context, data }) => {
    const { settings, token } = await botContext(context.userId);
    const site = settings.site_name || "RecargasBuxs";
    await send(
      token,
      data.channelId,
      {
        embeds: [styleEmbed("report", reportPanelEmbed(site), site)],
        components: reportPanelComponents(),
      },
      "o painel",
    );
    await setSettings({ discord_channel_report: data.channelId });
    await logAudit(context.userId, "discord.painel_relatorio_enviado", { canal: data.channelId });
    return { ok: true, buttonsWork: /^[0-9a-f]{64}$/i.test(settings.discord_public_key.trim()) };
  });

/** Sends a full report to a channel right now (no button needed). */
export const sendReportNow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ channelId, period: z.enum(["today", "7d", "30d"]) }))
  .handler(async ({ context, data }) => {
    const { settings, token } = await botContext(context.userId);
    const site = settings.site_name || "RecargasBuxs";
    const embeds = await buildReport(data.period, site);
    await send(token, data.channelId, { embeds: embeds.map((e) => styleEmbed("report", e, site)) }, "o relatório");
    await logAudit(context.userId, "discord.relatorio_enviado", { periodo: data.period });
    return { ok: true };
  });

/** Live probe of the payment gateway (also feeds the PIX / card status). */
export const runGatewayCheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const result = await runGatewayProbe();
    return {
      configured: result.configured,
      ok: result.probe.ok,
      latencyMs: result.probe.latencyMs,
      detail: result.probe.detail,
      health: result.health,
    };
  });

export const sendGatewayStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ channelId }))
  .handler(async ({ context, data }) => {
    const { settings, token } = await botContext(context.userId);
    const site = settings.site_name || "RecargasBuxs";
    const { health } = await runGatewayProbe();
    await send(
      token,
      data.channelId,
      { embeds: [styleEmbed("gateway", gatewayStatusEmbed(health), site)] },
      "o status",
    );
    return { ok: true };
  });

/** "Enviar exemplo": a realistic sample of one log type, to preview its look in Discord. */
export const sendDiscordSample = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ kind: z.enum(KINDS), channelId }))
  .handler(async ({ context, data }) => {
    const { settings, token } = await botContext(context.userId);
    const site = settings.site_name || "RecargasBuxs";
    const embeds = sampleEmbed(data.kind, site).map((e) => styleEmbed(data.kind, e, site));
    const extra = data.kind === "report" ? { components: reportPanelComponents() } : {};
    await send(token, data.channelId, { embeds, ...extra }, "o exemplo");
    return { ok: true };
  });
