import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { getClientMeta } from "@/lib/request-meta";
import {
  createStaffSession,
  currentStaffUser,
  destroyStaffSession,
  hashPassword,
  newStaffId,
  verifyPassword,
  type StaffUser,
} from "@/lib/staff-auth";
import { assertAllowedEmail } from "@/lib/staff";

export const getStaffAuthStatus = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentStaffUser();
  const sql = await getSql();
  await sql`
    create table if not exists staff_users (
      id text primary key,
      email text unique not null,
      name text not null default 'Admin',
      password_hash text not null,
      role text not null default 'owner',
      created_at timestamptz not null default now()
    )
  `;
  const countRow = await sql<{ n: number }>`select count(*)::int as n from staff_users`;
  const count = countRow[0]?.n ?? 0;

  return {
    authenticated: user !== null,
    user,
    needsSetup: count === 0,
  };
});

export const loginStaff = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().trim().toLowerCase().email().max(120),
      password: z.string().min(1).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`
      create table if not exists staff_users (
        id text primary key,
        email text unique not null,
        name text not null default 'Admin',
        password_hash text not null,
        role text not null default 'owner',
        created_at timestamptz not null default now()
      )
    `;

    const rows = await sql<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      role: string;
    }>`
      select id, email, name, password_hash, role
      from staff_users
      where lower(email) = ${data.email}
      limit 1
    `;

    const staffUser = rows[0];
    if (!staffUser || !verifyPassword(data.password, staffUser.password_hash)) {
      throw new Error("E-mail ou senha incorretos.");
    }

    await assertAllowedEmail(staffUser.id, staffUser.email);

    const { ip, userAgent } = getClientMeta();
    await createStaffSession(staffUser.id, ip, userAgent);

    return { ok: true, email: staffUser.email, role: staffUser.role };
  });

export const registerFirstStaff = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().max(80).optional(),
      email: z.string().trim().toLowerCase().email().max(120),
      password: z.string().min(6).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`
      create table if not exists staff_users (
        id text primary key,
        email text unique not null,
        name text not null default 'Admin',
        password_hash text not null,
        role text not null default 'owner',
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists staff (
        user_id text primary key,
        role text not null default 'admin',
        email text,
        name text,
        created_at timestamptz not null default now()
      )
    `;

    const countRow = await sql<{ n: number }>`select count(*)::int as n from staff_users`;
    if ((countRow[0]?.n ?? 0) > 0) {
      throw new Error("O dono do sistema já foi configurado. Faça login.");
    }

    const id = newStaffId();
    await assertAllowedEmail(id, data.email);

    const name = data.name?.trim() || "Admin";
    const pwHash = hashPassword(data.password);

    await sql`
      insert into staff_users (id, email, name, password_hash, role)
      values (${id}, ${data.email}, ${name}, ${pwHash}, 'owner')
    `;

    await sql`
      insert into staff (user_id, role, email, name)
      values (${id}, 'owner', ${data.email}, ${name})
      on conflict (user_id) do update set email = excluded.email, name = excluded.name
    `;

    const { ip, userAgent } = getClientMeta();
    await createStaffSession(id, ip, userAgent);

    return { ok: true, email: data.email, role: "owner" };
  });

export const logoutStaff = createServerFn({ method: "POST" }).handler(async () => {
  await destroyStaffSession();
  return { ok: true };
});
