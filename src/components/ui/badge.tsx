import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "line",
  children,
}: {
  className?: string;
  tone?: "line" | "accent" | "success" | "warn" | "ink";
  children: ReactNode;
}) {
  const tones = {
    line: "border-line bg-bg text-muted",
    accent: "border-accent/20 bg-accent/10 text-accent",
    success: "border-success/20 bg-success/10 text-success",
    warn: "border-warn/20 bg-warn/10 text-warn",
    ink: "border-fg/10 bg-ink text-accent-fg",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
