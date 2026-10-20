import { cn } from "@/lib/utils";

export function RobuxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("text-robux", className)} aria-hidden>
      <path
        fill="currentColor"
        d="M24 3.2 43.2 16.4v15.2L24 44.8 4.8 31.6V16.4L24 3.2Zm0 6.4L11.2 18.1v11.8L24 38.4l12.8-8.5V18.1L24 9.6Z"
      />
      <rect x="18.4" y="18.4" width="11.2" height="11.2" rx="1.6" fill="currentColor" />
    </svg>
  );
}
