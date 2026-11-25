import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`min-w-0 rounded-md bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";
