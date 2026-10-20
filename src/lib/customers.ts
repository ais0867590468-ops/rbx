import { getSql } from "@/lib/db";
import { logDiscord } from "@/lib/discord";
import { newCustomerEmbed } from "@/lib/discord-logs";

export type CustomerRow = {
  email: string;
  name: string;
  roblox_username: string | null;
  usernames: string;
  first_ip: string | null;
  last_ip: string | null;
  last_user_agent: string | null;
  vip: boolean;
  blocked: boolean;
  block_reason: string | null;
  tags: string;
  notes: string;
  created_at: string;
  last_seen_at: string;
};

export async function isCustomerBlocked(email: string) {
  const sql = await getSql();
  const rows = await sql<{ blocked: boolean }>`
    select blocked from customers where email = ${email} limit 1
  `;
  return rows[0]?.blocked === true;
}

/**
 * Creates (first checkout) or refreshes the customer module for an e-mail.
 * Called every time the checkout form is submitted successfully.
 */
export async function upsertCustomer(input: {
  email: string;
  name: string;
  robloxUsername: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const sql = await getSql();
  const existing = await sql<{ usernames: string }>`
    select usernames from customers where email = ${input.email} limit 1
  `;
  const isNew = existing.length === 0;
  let usernames: string[] = [];
  try {
    usernames = JSON.parse(existing[0]?.usernames ?? "[]") as string[];
  } catch {
    usernames = [];
  }
  if (!usernames.includes(input.robloxUsername)) usernames.push(input.robloxUsername);
  const list = JSON.stringify(usernames.slice(-20));
  await sql`
    insert into customers (email, name, roblox_username, usernames, first_ip, last_ip, last_user_agent)
    values (${input.email}, ${input.name}, ${input.robloxUsername}, ${list}, ${input.ip}, ${input.ip}, ${input.userAgent})
    on conflict (email) do update set
      name = excluded.name,
      roblox_username = excluded.roblox_username,
      usernames = ${list},
      last_ip = excluded.last_ip,
      last_user_agent = excluded.last_user_agent,
      last_seen_at = now()
  `;
  if (isNew) {
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values ('customer', ${input.ip}, ${input.userAgent}, '/checkout',
        ${JSON.stringify({ email: input.email, name: input.name, roblox: input.robloxUsername, event: "created" })})
    `;
    const total = await sql<{ n: number }>`select count(*)::int as n from customers`;
    await logDiscord(
      "customers",
      newCustomerEmbed({
        name: input.name,
        email: input.email,
        roblox: input.robloxUsername,
        totalCustomers: total[0]?.n ?? 1,
      }),
    );
  }
  return { isNew };
}

/** Admin-side action trail: DB log + optional Discord audit channel. */
export async function logAudit(actorUserId: string, action: string, detail: Record<string, unknown> = {}) {
  try {
    const sql = await getSql();
    await sql`
      insert into event_logs (kind, ip, user_agent, path, detail)
      values ('audit', null, null, ${action}, ${JSON.stringify({ actor: actorUserId, ...detail })})
    `;
    await logDiscord("audit", {
      title: `Painel · ${action}`,
      description: Object.entries(detail)
        .map(([k, v]) => `**${k}:** ${String(v).slice(0, 120)}`)
        .join("\n")
        .slice(0, 1500),
      fields: [{ name: "Equipe", value: actorUserId.slice(0, 24), inline: true }],
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
