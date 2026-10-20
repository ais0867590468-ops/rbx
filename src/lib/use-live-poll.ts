import { useEffect, useRef } from "react";

/**
 * Near-real-time updates without websockets (the site runs on serverless hosting).
 * Calls `tick` every `fast` ms while the tab is visible, every `slow` ms while hidden,
 * never overlaps two calls, backs off after errors and fires immediately when the tab
 * regains focus. Returns `pollNow` to trigger an extra round right away.
 */
export function useLivePoll(tick: () => Promise<void>, opts: { fast?: number; slow?: number } = {}) {
  const fast = opts.fast ?? 1000;
  const slow = opts.slow ?? 8000;
  const tickRef = useRef(tick);
  tickRef.current = tick;
  const runRef = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let running = false;
    let errors = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (stopped) return;
      const base = document.visibilityState === "hidden" ? slow : fast;
      timer = setTimeout(run, base * Math.min(5, 1 + errors));
    };
    async function run() {
      if (stopped || running) return;
      if (timer) clearTimeout(timer);
      running = true;
      try {
        await tickRef.current();
        errors = 0;
      } catch {
        errors += 1;
      } finally {
        running = false;
        schedule();
      }
    }
    const wake = () => {
      if (document.visibilityState === "visible") void run();
    };
    runRef.current = () => void run();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    void run();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [fast, slow]);

  return { pollNow: () => runRef.current() };
}

/** Short beep + tab-title badge when a message arrives while the tab is in the background. */
export function notifyIncoming(count: number) {
  if (typeof document === "undefined" || document.visibilityState === "visible") return;
  const base = document.title.replace(/^\(\d+\)\s*/, "");
  document.title = `(${count}) ${base}`;
  const restore = () => {
    if (document.visibilityState === "visible") {
      document.title = base;
      document.removeEventListener("visibilitychange", restore);
    }
  };
  document.addEventListener("visibilitychange", restore);
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => void ctx.close();
  } catch {
    /* autoplay blocked: the title badge is enough */
  }
}
