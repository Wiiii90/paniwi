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
          <a href={baseUrl}>Home</a>
          <a href={`${baseUrl}table`}>Tabelle</a>
          <a href={`${baseUrl}goals`}>Torschützenliste</a>
          <a href={`${baseUrl}matches`}>Spielplan</a>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
