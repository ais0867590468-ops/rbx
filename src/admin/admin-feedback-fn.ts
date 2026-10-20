import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { logAudit } from "@/lib/customers";
import { getSql } from "@/lib/db";
import { requireStaff } from "@/lib/staff";

export type FeedbackRow = {
  id: number;
  name: string;
  rating: number;
  message: string;
  robux_amount: number | null;
  source: string;
  status: string;
  order_id: string | null;
  created_at: string;
};

const statusSchema = z.enum(["approved", "pending", "hidden"]);

export const listFeedbackAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    return sql<FeedbackRow>`
      select id, name, rating, message, robux_amount, source, status, order_id, created_at
      from feedbacks
      order by (status = 'pending') desc, created_at desc, id desc
      limit 300
    `;
  });

export const saveFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.number().int().optional(),
      name: z.string().trim().min(1).max(40),
      rating: z.number().int().min(1).max(5),
      message: z.string().trim().min(4).max(280),
      robuxAmount: z.number().int().min(0).max(1_000_000).nullable().optional(),
      status: statusSchema.default("approved"),
    }),
  )
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    const robux = data.robuxAmount && data.robuxAmount > 0 ? data.robuxAmount : null;
    if (data.id) {
      await sql`
        update feedbacks
        set name = ${data.name}, rating = ${data.rating}, message = ${data.message},
            robux_amount = ${robux}, status = ${data.status}
        where id = ${data.id}
      `;
      await logAudit(context.userId, "feedback.editado", { id: data.id, status: data.status });
    } else {
      await sql`
        insert into feedbacks (name, rating, message, robux_amount, source, status)
        values (${data.name}, ${data.rating}, ${data.message}, ${robux}, 'admin', ${data.status})
      `;
      await logAudit(context.userId, "feedback.criado", { nome: data.name, status: data.status });
    }
    return { ok: true };
  });

export const setFeedbackStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int(), status: statusSchema }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    await sql`update feedbacks set status = ${data.status} where id = ${data.id}`;
    await logAudit(context.userId, "feedback.status", { id: data.id, status: data.status });
    return { ok: true };
  });

export const deleteFeedback = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int() }))
  .handler(async ({ context, data }) => {
    await requireStaff(context.userId);
    const sql = await getSql();
    await sql`delete from feedbacks where id = ${data.id}`;
    await logAudit(context.userId, "feedback.excluido", { id: data.id });
    return { ok: true };
  });
