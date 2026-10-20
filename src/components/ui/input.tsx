import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-md border border-line bg-surface px-3 text-sm text-fg placeholder:text-faint outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent/30",
        className,
      )}
      {...props}
    />
  );
}
