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
        "flex h-9 w-full rounded-xl px-3 py-1.5 text-sm",
        "bg-surface-container-low border border-outline-variant",
        "text-on-surface placeholder:text-outline/60",
        "focus:border-secondary focus:outline-none focus:shadow-[0_0_0_2px_rgba(77,224,130,0.15)]",
        "disabled:bg-background disabled:text-on-surface-variant/40 disabled:cursor-not-allowed",
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
