/**
 * Keeps working after the HTTP response was sent (Discord notifications, follow-up edits).
 * On Vercel the platform keeps the function alive for the task through the request
 * context's `waitUntil`; elsewhere (dev, node-server) the process simply keeps running.
 * Errors are logged, never thrown.
 */
export function runInBackground(task: Promise<unknown>) {
  const safe = task.catch((err) => console.error("background task failed", err));
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
      | { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined }
      | undefined;
    ctx?.get?.()?.waitUntil?.(safe);
  } catch {
    /* not on Vercel */
  }
}
