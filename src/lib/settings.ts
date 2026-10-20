import { getSql } from "@/lib/db";

export const SETTING_KEYS = [
  "purincash_api_key",
  "purincash_webhook_secret",
  "discord_bot_token",
  "discord_client_id",
  "discord_guild_id",
  "discord_channel_visits",
  "discord_channel_checkout",
  "discord_channel_paid",
  "discord_channel_tickets",
  "discord_channel_errors",
  "discord_channel_customers",
  "discord_channel_audit",
  "discord_channel_cart",
  "discord_channel_pix",
  "discord_channel_card",
  "discord_channel_gateway",
  "discord_channel_report",
  "discord_public_key",
  "discord_invite_saved",
  "site_name",
  "support_hours",
  "auto_deliver",
  "utmify_enabled",
  "utmify_pixel_id",
  "utmify_api_token",
  "utmify_platform",
  "utmify_send_waiting",
  "utmify_fee_percent",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

const FALLBACKS: Record<SettingKey, string> = {
  purincash_api_key: "",
  purincash_webhook_secret: "",
  discord_bot_token: "",
  discord_client_id: "",
  discord_guild_id: "",
  discord_channel_visits: "",
  discord_channel_checkout: "",
  discord_channel_paid: "",
  discord_channel_tickets: "",
  discord_channel_errors: "",
  discord_channel_customers: "",
  discord_channel_audit: "",
  discord_channel_cart: "",
  discord_channel_pix: "",
  discord_channel_card: "",
  discord_channel_gateway: "",
  discord_channel_report: "",
  discord_public_key: "",
  discord_invite_saved: "",
  site_name: "RecargasBuxs",
  support_hours: "Todos os dias, 9h às 23h (BRT)",
  auto_deliver: "true",
  utmify_enabled: "true",
  utmify_pixel_id: "",
  utmify_api_token: "",
  utmify_platform: "RecargasBuxs",
  utmify_send_waiting: "true",
  utmify_fee_percent: "0",
};

/** Env vars that override the DB value (never shown in the panel, never in source). */
const ENV_OVERRIDE: Partial<Record<SettingKey, string[]>> = {
  purincash_api_key: ["PURINCASH_API_KEY", "GATEWAY_API_KEY", "VULCANO_API_KEY"],
  purincash_webhook_secret: ["PURINCASH_WEBHOOK_SECRET", "GATEWAY_WEBHOOK_SECRET", "VULCANO_WEBHOOK_SECRET"],
  discord_bot_token: ["DISCORD_BOT_TOKEN"],
  discord_public_key: ["DISCORD_PUBLIC_KEY"],
  utmify_api_token: ["UTMIFY_API_TOKEN"],
  utmify_pixel_id: ["UTMIFY_PIXEL_ID"],
};

export function settingFromEnv(key: SettingKey): string | undefined {
  for (const name of ENV_OVERRIDE[key] ?? []) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return undefined;
}

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const sql = await getSql();
  const rows = await sql<{ key: string; value: string }>`select key, value from settings`;
  const map = { ...FALLBACKS };
  for (const row of rows) {
    if (row.key in map) map[row.key as SettingKey] = row.value;
  }
  for (const key of Object.keys(ENV_OVERRIDE) as SettingKey[]) {
    const fromEnv = settingFromEnv(key);
    if (fromEnv) map[key] = fromEnv;
  }
  return map;
}

export async function getSetting(key: SettingKey) {
  const all = await getSettings();
  return all[key];
}

export async function setSettings(patch: Partial<Record<SettingKey, string>>) {
  const sql = await getSql();
  for (const [key, value] of Object.entries(patch)) {
    if (!SETTING_KEYS.includes(key as SettingKey) || value === undefined) continue;
    await sql`
      insert into settings (key, value) values (${key}, ${value})
      on conflict (key) do update set value = ${value}
    `;
  }
}
