import { getSql } from "@/lib/db";

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Sem permissão de administrador.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Optional lock-down for the standalone admin deployment: when `ADMIN_EMAILS`
 * (comma separated) is set, ONLY those e-mails can ever become/act as staff.
 */
export function adminAllowlist(): string[] | null {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function assertAllowedEmail(userId: string, emailHint?: string | null) {
  const list = adminAllowlist();
  if (!list || list.length === 0) return;
  if (emailHint && list.includes(emailHint.toLowerCase())) return;

  const sql = await getSql();
  try {
    const staffUser = await sql<{ email: string | null }>`
      select email from staff_users where id = ${userId} limit 1
    `;
    if (staffUser[0]?.email && list.includes(staffUser[0].email.toLowerCase())) return;
  } catch {
    // table might not exist yet
  }

  try {
    const staffRow = await sql<{ email: string | null }>`
      select email from staff where user_id = ${userId} limit 1
    `;
    if (staffRow[0]?.email && list.includes(staffRow[0].email.toLowerCase())) return;
  } catch {
    // ignore
  }

  try {
    const userRow = await sql<{ email: string | null }>`
      select email from "user" where id = ${userId} limit 1
    `;
    const email = userRow[0]?.email?.toLowerCase();
    if (email && list.includes(email)) return;
  } catch {
    // user table might not exist
  }

  throw new ForbiddenError("Este e-mail não consta na lista de administradores autorizados (ADMIN_EMAILS).");
}

export async function requireStaff(userId: string, profile?: { email?: string | null; name?: string | null }) {
  // If active staff session matches, return directly
  // Dynamic import: staff-auth uses node:crypto and must never be evaluated in the browser.
  const { currentStaffUser } = await import("@/lib/staff-auth");
  const staff = await currentStaffUser();
  if (staff && staff.id === userId) {
    return { userId: staff.id, role: staff.role };
  }

  await assertAllowedEmail(userId, profile?.email);
  const sql = await getSql();

  await sql`
    create table if not exists staff (
      user_id text primary key,
      role text not null default 'admin',
      email text,
      name text,
      created_at timestamptz not null default now()
    )
  `;

  const existing = await sql<{ user_id: string; role: string }>`
    select user_id, role from staff
  `;
  if (existing.length === 0) {
    await sql`
      insert into staff (user_id, role, email, name)
      values (${userId}, 'owner', ${profile?.email ?? null}, ${profile?.name ?? null})
      on conflict (user_id) do nothing
    `;
    return { userId, role: "owner" };
  }
  const me = existing.find((row) => row.user_id === userId);
  if (me) return { userId, role: me.role };

  try {
    const su = await sql<{ id: string; role: string; email: string; name: string }>`
      select id, role, email, name from staff_users where id = ${userId} limit 1
    `;
    if (su[0]) {
      await sql`
        insert into staff (user_id, role, email, name)
        values (${su[0].id}, ${su[0].role}, ${su[0].email}, ${su[0].name})
        on conflict (user_id) do update set role = excluded.role, email = excluded.email
      `;
      return { userId: su[0].id, role: su[0].role };
    }
  } catch {
    // staff_users might not exist yet
  }

  throw new ForbiddenError();
}

export async function isStaff(userId: string) {
  try {
    const s = await requireStaff(userId);
    return Boolean(s);
  } catch {
    return false;
  }
}
