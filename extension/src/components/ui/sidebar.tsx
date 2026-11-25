import type { ButtonHTMLAttributes, ReactNode } from "react";

type SidebarLinkProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  active?: boolean;
  children: ReactNode;
};

export function SidebarLink({ icon, active, children, className = "", ...props }: SidebarLinkProps) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={`group/sidebar flex min-w-0 items-center justify-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
        active ? "bg-blue-500/10 text-blue-300" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      } ${className}`}
      {...props}
    >
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}
