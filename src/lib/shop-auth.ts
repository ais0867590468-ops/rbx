import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";

const COOKIE = "rb_session";
const SESSION_DAYS = 30;

export type ShopUser = {
  id: string;
  email: string;
  name: string;
  banned: boolean;
  ban_reason: string | null;
};

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newUserId() {
  return `u_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export async function createSession(userId: string, ip: string, userAgent: string) {
  const token = randomBytes(32).toString("base64url");
  const sql = await getSql();
  await sql`
    insert into shop_sessions (token_hash, user_id, ip, user_agent, expires_at)
    values (${tokenHash(token)}, ${userId}, ${ip}, ${userAgent.slice(0, 300)},
            now() + ${`${SESSION_DAYS} days`}::interval)
  `;
  setCookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const token = getCookie(COOKIE);
  deleteCookie(COOKIE, { path: "/" });
  if (!token) return;
  const sql = await getSql();
  await sql`delete from shop_sessions where token_hash = ${tokenHash(token)}`;
}

/** Returns the signed-in (and not banned) account, or null. */
export async function currentShopUser(): Promise<ShopUser | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const sql = await getSql();
  const rows = await sql<ShopUser>`
    select u.id, u.email, u.name, u.banned, u.ban_reason
    from shop_sessions s join shop_users u on u.id = s.user_id
    where s.token_hash = ${tokenHash(token)} and s.expires_at > now()
    limit 1
  `;
  const user = rows[0];
  if (!user || user.banned) return null;
  return user;
}
