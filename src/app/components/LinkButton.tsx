import type { ReactNode } from "react";

type LinkButtonProps = {
  href: string;
  children: ReactNode;
};

export function LinkButton({ href, children }: LinkButtonProps) {
  return (
    <a className="text-link button-link" href={href}>
      {children}
    </a>
  );
}
