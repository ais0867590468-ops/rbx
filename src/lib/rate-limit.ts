import { getSql } from "@/lib/db";

export async function takeRateLimit(key: string, limit: number, windowMs: number) {
  const sql = await getSql();
  const rows = await sql<{ count: number; window_start: string }>`
    select count, window_start from rate_limits where key = ${key}
  `;
  const now = Date.now();
  const start = rows[0] ? new Date(rows[0].window_start).getTime() : 0;
  if (!rows[0] || now - start > windowMs) {
    await sql`
      insert into rate_limits (key, count, window_start)
      values (${key}, 1, now())
      on conflict (key) do update set count = 1, window_start = now()
    `;
    return true;
  }
  if (rows[0].count >= limit) return false;
  await sql`update rate_limits set count = count + 1 where key = ${key}`;
  return true;
}
