import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { logDiscord } from "@/lib/discord";
import { newAccountEmbed } from "@/lib/discord-logs";
import { assertIpAllowed } from "@/lib/ip-ban";
import { takeRateLimit } from "@/lib/rate-limit";
import { getClientMeta, getGeo } from "@/lib/request-meta";
import {
  createSession,
  currentShopUser,
  destroySession,
  hashPassword,
  newUserId,
  verifyPassword,
} from "@/lib/shop-auth";

const emailSchema = z.string().trim().toLowerCase().email().max(120);
const passwordSchema = z.string().min(8).max(100);

async function logEvent(kind: string, ip: string, ua: string, path: string, detail: Record<string, unknown>) {
  const sql = await getSql();
  await sql`
    insert into event_logs (kind, ip, user_agent, path, detail)
    values (${kind}, ${ip}, ${ua}, ${path}, ${JSON.stringify(detail)})
  `;
}

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentShopUser();
  return user ? { id: user.id, email: user.email, name: user.name } : null;
});

export const registerAccount = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().max(80).optional(),
      email: emailSchema,
      password: passwordSchema,
      website: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { ip, userAgent } = getClientMeta();
    await assertIpAllowed(ip);
    if (data.website && data.website.trim() !== "") throw new Error("Não foi possível criar a conta.");
    if (!(await takeRateLimit(`register:${ip}`, 5, 60 * 60 * 1000))) {
      throw new Error("Muitas tentativas. Aguarde um pouco.");
    }
    const sql = await getSql();
    const exists = await sql<{ id: string }>`select id from shop_users where email = ${data.email} limit 1`;
    if (exists[0]) throw new Error("Já existe uma conta com esse e-mail. Entre com sua senha.");
    const id = newUserId();
    await sql`
      insert into shop_users (id, email, name, password_hash, signup_ip, last_ip, last_user_agent, last_login_at, login_count)
      values (${id}, ${data.email}, ${data.name ?? ""}, ${hashPassword(data.password)}, ${ip}, ${ip}, ${userAgent.slice(0, 300)}, now(), 1)
    `;
    await createSession(id, ip, userAgent);
    await logEvent("account", ip, userAgent, "/conta", { event: "register", email: data.email });
    const total = await sql<{ n: number }>`select count(*)::int as n from shop_users`;
    await logDiscord(
      "customers",
      newAccountEmbed({
        ip,
        userAgent,
        referer: getClientMeta().referer,
        geo: getGeo(),
        email: data.email,
        name: data.name ?? "",
        totalAccounts: total[0]?.n ?? 1,
      }),
    );
    return { ok: true };
  });

export const loginAccount = createServerFn({ method: "POST" })
  .validator(z.object({ email: emailSchema, password: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const { ip, userAgent } = getClientMeta();
    await assertIpAllowed(ip);
    if (!(await takeRateLimit(`login:${ip}`, 12, 15 * 60 * 1000))) {
      throw new Error("Muitas tentativas. Aguarde alguns minutos.");
    }
    if (!(await takeRateLimit(`login-email:${data.email}`, 8, 15 * 60 * 1000))) {
      throw new Error("Muitas tentativas para este e-mail. Aguarde alguns minutos.");
    }
    const sql = await getSql();
    const rows = await sql<{ id: string; password_hash: string; banned: boolean }>`
      select id, password_hash, banned from shop_users where email = ${data.email} limit 1
    `;
    const user = rows[0];
    // Same message for unknown e-mail and wrong password (no account enumeration).
    if (!user || !verifyPassword(data.password, user.password_hash)) {
      await logEvent("account", ip, userAgent, "/conta", { event: "login_failed", email: data.email });
      throw new Error("E-mail ou senha incorretos.");
    }
    if (user.banned) {
      await logEvent("account", ip, userAgent, "/conta", { event: "login_banned", email: data.email });
      throw new Error("Esta conta está suspensa. Fale com o suporte.");
    }
    await sql`
      update shop_users set last_login_at = now(), login_count = login_count + 1,
        last_ip = ${ip}, last_user_agent = ${userAgent.slice(0, 300)}
      where id = ${user.id}
    `;
    await createSession(user.id, ip, userAgent);
    await logEvent("account", ip, userAgent, "/conta", { event: "login", email: data.email });
    return { ok: true };
  });

export const logoutAccount = createServerFn({ method: "POST" }).handler(async () => {
  await destroySession();
  return { ok: true };
});

export const myOrders = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentShopUser();
  if (!user) return null;
  const sql = await getSql();
  const orders = await sql<{
    id: string;
    product_name: string;
    robux_amount: number;
    price_cents: number;
    status: string;
    created_at: string;
  }>`
    select id, product_name, robux_amount, price_cents, status, created_at
    from orders where customer_email = ${user.email}
    order by created_at desc limit 50
  `;
  return { user: { email: user.email, name: user.name }, orders };
});

export const changeMyPassword = createServerFn({ method: "POST" })
  .validator(z.object({ current: z.string().min(1).max(100), next: passwordSchema }))
  .handler(async ({ data }) => {
    const user = await currentShopUser();
    if (!user) throw new Error("Entre na sua conta primeiro.");
    const { ip } = getClientMeta();
    if (!(await takeRateLimit(`pwchange:${user.id}`, 6, 60 * 60 * 1000))) {
      throw new Error("Muitas tentativas. Aguarde.");
    }
    const sql = await getSql();
    const rows = await sql<{ password_hash: string }>`select password_hash from shop_users where id = ${user.id}`;
    if (!rows[0] || !verifyPassword(data.current, rows[0].password_hash)) {
      throw new Error("Senha atual incorreta.");
    }
    await sql`update shop_users set password_hash = ${hashPassword(data.next)} where id = ${user.id}`;
    await logEvent("account", ip, "", "/conta", { event: "password_changed", email: user.email });
    return { ok: true };
  });
