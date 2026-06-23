import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)]",
        "placeholder:text-[var(--text-muted)]",
        "focus:border-[rgb(var(--accent-rgb)/0.60)] focus:bg-[var(--bg-surface)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-rgb)/0.15)]",
        "disabled:bg-[var(--bg-base)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed",
        "transition-all duration-150",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
