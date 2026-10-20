import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[opacity,transform,background-color] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
  {
    variants: {
      variant: {
        default: "bg-accent text-on-accent font-semibold hover:opacity-90",
        ink: "bg-ink text-accent-fg hover:opacity-90",
        outline: "border border-line bg-surface text-fg hover:bg-bg",
        ghost: "text-fg hover:bg-line/60",
        subtle: "bg-bg text-fg border border-line hover:bg-surface",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-5",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
