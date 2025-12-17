import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500",
        outline: "border border-midnight-border/40 bg-surface text-ink hover:bg-surface-alt",
        secondary: "bg-midnight text-white hover:bg-slate-800",
        ghost: "bg-transparent text-ink-strong hover:bg-surface-alt",
        destructive: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
      },
      size: {
        default: "px-md py-xs",
        sm: "px-sm py-1.5 text-xs",
        lg: "px-lg py-2.5 text-base",
        icon: "h-9 w-9 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
