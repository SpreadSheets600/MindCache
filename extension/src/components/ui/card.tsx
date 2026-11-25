import type { HTMLAttributes } from "react";

export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`relative min-w-0 rounded-xl border border-border bg-card/30 p-5 ${className}`} {...props}>{children}</div>;
}
