/**
 * Discord interactions endpoint (report panel + ticket buttons).
 *
 * Discord POSTs here when someone clicks a button or submits a form. Every request is
 * authenticated with the application's Ed25519 public key (Discord Developer Portal ->
 * General Information -> Public Key); anything unsigned or badly signed is rejected with
 * 401 BEFORE any data is read. Buttons only work in the configured server and channel.
 * No gateway websocket is needed, so it works on serverless hosting.
 *
 * SPEED: Discord gives only 3 seconds to answer, and a cold serverless start eats a good
 * part of that. So the work done before answering is kept to the bare minimum (read the
 * settings, check the signature, check guild/channel, in-memory rate limit). Anything that
 * touches the database or an external API runs AFTER answering "thinking..." (type 5) and
 * fills the message in afterwards; opening the reply form needs no database at all.
 */
import { createPublicKey, verify } from "node:crypto";
import { getSql } from "@/lib/db";
import { finalizeEmbed, resolveChannel } from "@/lib/discord";
import { gatewayStatusEmbed, REPORT_PANEL_ID, TICKET_ID, ticketComponents } from "@/lib/discord-logs";
import { buildReport, type ReportPeriod } from "@/lib/discord-report";
import { runGatewayProbe } from "@/lib/gateway-health";
import { getSettings } from "@/lib/settings";

const MAX_BODY = 64 * 1024;
const MAX_AGE_MS = 5 * 60 * 1000;
/** DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows. */
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const DISCORD_API = "https://discord.com/api/v10";
const TICKET_ID_RE = /^[A-Za-z0-9_-]{3,40}$/;

export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string,
) {
  try {
    if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

type Interaction = {
  type: number;
  application_id?: string;
  token?: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user?: { id: string; username?: string } };
  user?: { id: string; username?: string };
  data?: {
    custom_id?: string;
    components?: Array<{ components?: Array<{ custom_id?: string; value?: string }> }>;
  };
};

type Settings = Awaited<ReturnType<typeof getSettings>>;

const PERIOD_BY_ID: Record<string, ReportPeriod> = {
  [REPORT_PANEL_ID.today]: "today",
  [REPORT_PANEL_ID.week]: "7d",
  [REPORT_PANEL_ID.month]: "30d",
};

// ───────────────────────────────── small helpers ─────────────────────────────────

/** Per-instance sliding-window limiter: no database round trip before answering Discord. */
const hits = new Map<string, number[]>();
function localLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 2000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}

/** Messages only the person who clicked can see (flags 64 = ephemeral). */
function privateReply(content: string) {
  return Response.json({ type: 4, data: { content, flags: 64 } });
}

/** "Bot is thinking..." — the real message is filled in by `editOriginal` afterwards. */
function defer() {
  return Response.json({ type: 5 });
}

function whoClicked(body: Interaction) {
  const user = body.member?.user ?? body.user;
  return { id: user?.id ?? "?", name: user?.username ?? "alguém" };
}

/**
 * Keeps working after the response was sent. On Vercel the platform keeps the function
 * alive for the task through the request context's `waitUntil`; elsewhere the process
 * simply keeps running.
 */
function background(task: Promise<unknown>) {
  const safe = task.catch((err) => console.error("discord background task failed", err));
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
      | { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined }
      | undefined;
    ctx?.get?.()?.waitUntil?.(safe);
  } catch {
    /* not on Vercel */
  }
}

/** Fills in the "thinking..." message created by a deferred response. */
async function editOriginal(body: Interaction, payload: Record<string, unknown>) {
  if (!body.application_id || !body.token) return;
  const res = await fetch(`${DISCORD_API}/webhooks/${body.application_id}/${body.token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...payload }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) console.error("discord edit original failed", res.status, await res.text().catch(() => ""));
}

/** Runs `job` after answering and turns any failure into a visible message. */
function deferred(body: Interaction, failure: string, job: () => Promise<Record<string, unknown>>) {
  background(
    (async () => {
      try {
        await editOriginal(body, await job());
      } catch (err) {
        console.error("discord deferred job failed", err);
        await editOriginal(body, { content: failure }).catch(() => {});
      }
    })(),
  );
  return defer();
}

/** Only the configured server (and, when set, the configured channel) may use the buttons. */
function notAuthorized(body: Interaction, settings: Settings, channelId: string, what: string) {
  if (settings.discord_guild_id && body.guild_id !== settings.discord_guild_id) {
    return privateReply("⛔ Este painel não está autorizado neste servidor.");
  }
  if (channelId && body.channel_id !== channelId) {
    return privateReply(`⛔ ${what} só funciona no canal em que foi configurado.`);
  }
  return null;
}

async function findTicket(publicId: string) {
  if (!TICKET_ID_RE.test(publicId)) return null;
  const sql = await getSql();
  const rows = await sql<{ id: number; public_id: string; subject: string; name: string; status: string }>`
    select id, public_id, subject, name, status from tickets where public_id = ${publicId} limit 1
  `;
  return rows[0] ?? null;
}

// ──────────────────────────────── report panel ─────────────────────────────────

function handleReport(body: Interaction, settings: Settings, id: string) {
  const denied = notAuthorized(body, settings, settings.discord_channel_report, "Este painel");
  if (denied) return denied;
  const period = PERIOD_BY_ID[id];
  if (id !== REPORT_PANEL_ID.gateway && !period) return privateReply("Botão desconhecido.");
  if (!localLimit(`report:${whoClicked(body).id}`, 15, 60_000)) {
    return privateReply("⏳ Calma! Aguarde um instante antes de pedir outro relatório.");
  }
  return deferred(body, "❌ Não consegui montar o relatório agora. Tente de novo em instantes.", async () => {
    if (id === REPORT_PANEL_ID.gateway) {
      const { health } = await runGatewayProbe();
      return { embeds: [finalizeEmbed(gatewayStatusEmbed(health))] };
    }
    const embeds = await buildReport(period, settings.site_name);
    return { embeds: embeds.map(finalizeEmbed) };
  });
}

// ─────────────────────────────────── tickets ───────────────────────────────────

/** "Responder" opens the form (no database needed); "Encerrar" closes the ticket. */
function handleTicketButton(body: Interaction, settings: Settings, id: string) {
  const denied = notAuthorized(body, settings, resolveChannel(settings, "tickets"), "Os tickets");
  if (denied) return denied;
  const who = whoClicked(body);
  if (!localLimit(`ticket:${who.id}`, 30, 60_000)) return privateReply("⏳ Calma! Aguarde um instante.");
  const closing = id.startsWith(TICKET_ID.close);
  const publicId = id.slice((closing ? TICKET_ID.close : TICKET_ID.reply).length);
  if (!TICKET_ID_RE.test(publicId)) return privateReply("Ticket não encontrado.");

  if (!closing) {
    return Response.json({
      type: 9,
      data: {
        custom_id: `${TICKET_ID.modal}${publicId}`,
        title: `Responder ${publicId}`.slice(0, 45),
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "body",
                style: 2,
                label: "Mensagem para o cliente",
                min_length: 2,
                max_length: 1800,
                required: true,
                placeholder: "Escreva a resposta. O cliente vê na página do ticket.",
              },
            ],
          },
        ],
      },
    });
  }

  return deferred(body, "❌ Não consegui encerrar o ticket. Tente de novo.", async () => {
    const ticket = await findTicket(publicId);
    if (!ticket) return { content: "Ticket não encontrado." };
    const sql = await getSql();
    await sql`update tickets set status = 'closed', updated_at = now() where id = ${ticket.id}`;
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values ('audit', null, null, 'ticket.encerrado_discord',
        ${JSON.stringify({ ticket: ticket.public_id, discord: who.name })})
    `;
    return {
      embeds: [
        finalizeEmbed({
          title: "🔒 TICKET ENCERRADO",
          color: 0x94a3b8,
          description: `**${ticket.subject}**`,
          fields: [
            { name: "🎫 Código", value: `\`${ticket.public_id}\``, inline: true },
            { name: "👮 Encerrado por", value: `<@${who.id}>`, inline: true },
          ],
        }),
      ],
    };
  });
}

/** The form was submitted: store the answer as the team's message in the ticket. */
function handleTicketModal(body: Interaction, settings: Settings) {
  const denied = notAuthorized(body, settings, resolveChannel(settings, "tickets"), "Os tickets");
  if (denied) return denied;
  const who = whoClicked(body);
  if (!localLimit(`ticket-reply:${who.id}`, 20, 60_000)) return privateReply("⏳ Calma! Aguarde um instante.");
  const publicId = (body.data?.custom_id ?? "").slice(TICKET_ID.modal.length);
  const text = (body.data?.components ?? [])
    .flatMap((row) => row.components ?? [])
    .find((c) => c.custom_id === "body")
    ?.value?.trim();
  if (!text) return privateReply("Escreva uma mensagem para responder.");
  if (!TICKET_ID_RE.test(publicId)) return privateReply("Ticket não encontrado.");

  return deferred(body, "❌ Não consegui enviar a resposta. Tente de novo.", async () => {
    const ticket = await findTicket(publicId);
    if (!ticket) return { content: "Ticket não encontrado." };
    if (ticket.status === "closed") return { content: "Este ticket está encerrado." };
    const sql = await getSql();
    await sql`
      insert into ticket_messages (ticket_id, author_role, author_name, body)
      values (${ticket.id}, 'admin', 'Equipe RecargasBuxs', ${text.slice(0, 4000)})
    `;
    await sql`update tickets set status = 'waiting', updated_at = now() where id = ${ticket.id}`;
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values ('audit', null, null, 'ticket.respondido_discord',
        ${JSON.stringify({ ticket: ticket.public_id, discord: who.name })})
    `;
    return {
      embeds: [
        finalizeEmbed({
          title: "✅ RESPOSTA ENVIADA AO CLIENTE",
          color: 0x22c55e,
          description: `**${ticket.subject}**`,
          fields: [
            { name: "🎫 Código", value: `\`${ticket.public_id}\``, inline: true },
            { name: "👮 Respondido por", value: `<@${who.id}>`, inline: true },
            { name: "💬 Resposta", value: text.slice(0, 900) },
          ],
        }),
      ],
      components: ticketComponents(ticket.public_id),
    };
  });
}

// ─────────────────────────────────── entrypoint ────────────────────────────────

function handleComponent(body: Interaction, settings: Settings) {
  const id = body.data?.custom_id ?? "";
  if (!id.startsWith("rb:")) return privateReply("Botão desconhecido.");
  if (id.startsWith(TICKET_ID.reply) || id.startsWith(TICKET_ID.close)) {
    return handleTicketButton(body, settings, id);
  }
  return handleReport(body, settings, id);
}

export async function handleDiscordInteraction(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  if (!localLimit(`ip:${ip}`, 120, 60_000)) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return Response.json({ error: "payload too large" }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "payload too large" }, { status: 413 });

  const settings = await getSettings();
  const publicKey = settings.discord_public_key.trim();
  const signature = request.headers.get("x-signature-ed25519") ?? "";
  const timestamp = request.headers.get("x-signature-timestamp") ?? "";
  const fresh = Math.abs(Date.now() - Number(timestamp) * 1000) <= MAX_AGE_MS;
  if (!publicKey || !fresh || !verifyDiscordSignature(publicKey, signature, timestamp, raw)) {
    return new Response("invalid request signature", { status: 401 });
  }

  let body: Interaction;
  try {
    body = JSON.parse(raw) as Interaction;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    if (body.type === 1) return Response.json({ type: 1 });
    if (body.type === 3) return handleComponent(body, settings);
    if (body.type === 5) {
      if (!(body.data?.custom_id ?? "").startsWith(TICKET_ID.modal)) return privateReply("Formulário desconhecido.");
      return handleTicketModal(body, settings);
    }
    return privateReply("Esse tipo de interação não é suportado.");
  } catch (err) {
    console.error("discord interaction failed", err);
    return privateReply("❌ Algo deu errado. Tente de novo em instantes.");
  }
}
