import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={baseUrl}>
          <span className="brand-mark">26</span>
          <span>Panini Liga</span>
        </a>
        <nav className="nav">
          <a href={baseUrl}>Tabelle</a>
          <a href={`${baseUrl}goals`}>Treffer</a>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
