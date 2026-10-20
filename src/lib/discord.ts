import { getSettings } from "@/lib/settings";

const API = "https://discord.com/api/v10";
const ACCENT = 0x3b82f6;

type EmbedField = { name: string; value: string; inline?: boolean };

export type DiscordEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  footer?: { text: string };
  author?: { name: string };
  timestamp?: string;
};

/** Raw Discord message components (buttons etc.). Built in `discord-logs.ts`. */
export type DiscordComponents = Array<Record<string, unknown>>;

export type DiscordPayload = {
  content?: string;
  embeds?: DiscordEmbed[];
  components?: DiscordComponents;
};

async function botFetch(path: string, token: string, init?: RequestInit, timeoutMs = 10_000) {
  const res = await fetch(`${API}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    let err = `Discord ${res.status}`;
    if (typeof json === "object" && json && "message" in json) {
      err = String((json as { message: string }).message);
      // "Invalid Form Body" hides which field is wrong — surface the details.
      const details = (json as { errors?: unknown }).errors;
      if (details) err += ` — ${JSON.stringify(details).slice(0, 300)}`;
    }
    throw new Error(err);
  }
  return json;
}

export async function fetchBotIdentity(token: string) {
  const me = (await botFetch("/users/@me", token)) as {
    id: string;
    username: string;
    discriminator?: string;
  };
  return me;
}

export async function fetchGuilds(token: string) {
  const guilds = (await botFetch("/users/@me/guilds", token)) as Array<{
    id: string;
    name: string;
  }>;
  return guilds;
}

export async function fetchTextChannels(token: string, guildId: string) {
  const channels = (await botFetch(`/guilds/${guildId}/channels`, token)) as Array<{
    id: string;
    name: string;
    type: number;
  }>;
  return channels.filter((c) => c.type === 0 || c.type === 5);
}

export function botInviteUrl(clientId: string) {
  const perms = 84992;
  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${perms}&scope=bot%20applications.commands`;
}

/** Discord rejects empty/oversized embed parts with "Invalid Form Body"; clamp everything to its limits. */
export function cleanEmbed(embed: DiscordEmbed): DiscordEmbed {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const text = (s: unknown, n: number, fallback = "—") => {
    const v = String(s ?? "").trim();
    return clip(v || fallback, n);
  };
  return {
    ...embed,
    title: text(embed.title, 256, "RecargasBuxs"),
    description: embed.description ? text(embed.description, 4000) : undefined,
    fields: (embed.fields ?? []).slice(0, 25).map((f) => ({
      name: text(f.name, 256),
      value: text(f.value, 1024),
      inline: f.inline,
    })),
    footer: embed.footer ? { text: text(embed.footer.text, 2048) } : undefined,
    author: embed.author ? { name: text(embed.author.name, 256) } : undefined,
  };
}

/** Embeds as the Discord API wants them (defaults + clamped limits). */
export function finalizeEmbed(embed: DiscordEmbed): DiscordEmbed {
  return {
    color: ACCENT,
    timestamp: new Date().toISOString(),
    ...cleanEmbed(embed),
  };
}

export async function postMessage(
  token: string,
  channelId: string,
  payload: DiscordPayload,
  timeoutMs?: number,
) {
  const body: Record<string, unknown> = {
    embeds: (payload.embeds ?? []).slice(0, 10).map(finalizeEmbed),
  };
  if (payload.content) body.content = payload.content.slice(0, 2000);
  if (payload.components?.length) body.components = payload.components;
  return (await botFetch(
    `/channels/${channelId.trim()}/messages`,
    token,
    { method: "POST", body: JSON.stringify(body) },
    timeoutMs,
  )) as { id: string; channel_id: string };
}

export async function postChannelMessage(
  token: string,
  channelId: string,
  embed: DiscordEmbed,
) {
  await postMessage(token, channelId, { embeds: [embed] });
}

export type LogKind =
  | "visits"
  | "cart"
  | "checkout"
  | "pix"
  | "card"
  | "paid"
  | "tickets"
  | "errors"
  | "customers"
  | "audit"
  | "gateway"
  | "report";

export const CHANNEL_KEY: Record<LogKind, keyof Awaited<ReturnType<typeof getSettings>>> = {
  visits: "discord_channel_visits",
  cart: "discord_channel_cart",
  checkout: "discord_channel_checkout",
  pix: "discord_channel_pix",
  card: "discord_channel_card",
  paid: "discord_channel_paid",
  tickets: "discord_channel_tickets",
  errors: "discord_channel_errors",
  customers: "discord_channel_customers",
  audit: "discord_channel_audit",
  gateway: "discord_channel_gateway",
  report: "discord_channel_report",
};

/** A kind without its own channel falls back to the closest related one, so logs never vanish. */
const FALLBACK: Partial<Record<LogKind, LogKind[]>> = {
  cart: ["checkout", "visits"],
  pix: ["checkout"],
  card: ["checkout"],
  gateway: ["errors"],
};

/** Sidebar color + default icon per log type, applied to every embed automatically. */
export const KIND_STYLE: Record<LogKind, { color: number; icon: string }> = {
  visits: { color: 0x38bdf8, icon: "👁️" },
  cart: { color: 0xf59e0b, icon: "🛍️" },
  checkout: { color: 0xa78bfa, icon: "🛒" },
  pix: { color: 0x2dd4bf, icon: "💠" },
  card: { color: 0x818cf8, icon: "💳" },
  paid: { color: 0x22c55e, icon: "💰" },
  tickets: { color: 0xf472b6, icon: "🎧" },
  errors: { color: 0xef4444, icon: "🚨" },
  customers: { color: 0x60a5fa, icon: "👤" },
  audit: { color: 0x94a3b8, icon: "🛡️" },
  gateway: { color: 0x22c55e, icon: "⚙️" },
  report: { color: 0xfacc15, icon: "📊" },
};

export function resolveChannel(
  settings: Awaited<ReturnType<typeof getSettings>>,
  kind: LogKind,
) {
  for (const k of [kind, ...(FALLBACK[kind] ?? [])]) {
    const id = String(settings[CHANNEL_KEY[k]] ?? "").trim();
    if (id) return id;
  }
  return (
    String(settings.discord_channel_checkout || "").trim() ||
    String(settings.discord_channel_paid || "").trim() ||
    String(settings.discord_channel_pix || "").trim() ||
    String(settings.discord_channel_visits || "").trim() ||
    String(settings.discord_channel_errors || "").trim() ||
    ""
  );
}

const STARTS_WITH_ICON = /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

/** Consistent look for every log: color per type, icon in the title, footer with the store name. */
export function styleEmbed(kind: LogKind, embed: DiscordEmbed, siteName: string): DiscordEmbed {
  const style = KIND_STYLE[kind];
  const title = STARTS_WITH_ICON.test(embed.title.trim())
    ? embed.title
    : `${style.icon} ${embed.title}`;
  return {
    ...embed,
    title,
    color: embed.color ?? style.color,
    footer: embed.footer ?? { text: `${siteName || "RecargasBuxs"} · Log em tempo real` },
    timestamp: embed.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Posts a styled log to the channel configured for `kind`. Never throws (a failing
 * Discord must not break a checkout) and uses a short timeout so it cannot slow the
 * customer down. Returns whether a message was actually sent.
 */
export async function logDiscord(kind: LogKind, embed: DiscordEmbed, extra?: Omit<DiscordPayload, "embeds">) {
  try {
    const settings = await getSettings();
    const token = settings.discord_bot_token.trim();
    const channelId = resolveChannel(settings, kind);
    if (!token || !channelId) return false;
    await postMessage(
      token,
      channelId,
      { ...extra, embeds: [styleEmbed(kind, embed, settings.site_name)] },
      3500,
    );
    return true;
  } catch (err) {
    console.error("discord log failed", kind, err);
    return false;
  }
}
