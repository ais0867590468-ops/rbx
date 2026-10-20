import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";

const COOKIE = "rb_staff_token";
const SESSION_DAYS = 30;

export type StaffUser = {
  id: string;
  email: string;
  name: string;
  role: string;
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

export function newStaffId() {
  return `staff_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function createStaffSession(staffId: string, ip: string, userAgent: string) {
  const token = randomBytes(32).toString("base64url");
  const sql = await getSql();
  await sql`
    create table if not exists staff_sessions (
      token_hash text primary key,
      staff_id text not null,
      ip text,
      user_agent text,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `;
  await sql`
    insert into staff_sessions (token_hash, staff_id, ip, user_agent, expires_at)
    values (${tokenHash(token)}, ${staffId}, ${ip}, ${userAgent.slice(0, 300)},
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

export async function destroyStaffSession() {
  const token = getCookie(COOKIE);
  deleteCookie(COOKIE, { path: "/" });
  if (!token) return;
  try {
    const sql = await getSql();
    await sql`delete from staff_sessions where token_hash = ${tokenHash(token)}`;
  } catch {
    // silent
  }
}

export async function currentStaffUser(): Promise<StaffUser | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  try {
    const sql = await getSql();
    const rows = await sql<StaffUser>`
      select u.id, u.email, u.name, u.role
      from staff_sessions s join staff_users u on u.id = s.staff_id
      where s.token_hash = ${tokenHash(token)} and s.expires_at > now()
      limit 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
