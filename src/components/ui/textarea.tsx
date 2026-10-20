import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-28 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent/30",
        className,
      )}
      {...props}
    />
  );
}
