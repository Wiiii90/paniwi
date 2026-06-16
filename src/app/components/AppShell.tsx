import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { href: "", label: "Home", match: (path: string) => path === "/" },
  { href: "table", label: "Tabelle", match: (path: string) => path === "/table" || path === "/leaderboard" },
  { href: "goals", label: "Torschützenliste", match: (path: string) => path === "/goals" },
  { href: "matches", label: "Spielplan", match: (path: string) => path === "/matches" }
];

export function AppShell({ children }: AppShellProps) {
  const baseUrl = import.meta.env.BASE_URL;
  const basePath = baseUrl.replace(/\/$/, "");
  const appPath =
    basePath && window.location.pathname.startsWith(basePath)
      ? window.location.pathname.slice(basePath.length) || "/"
      : window.location.pathname;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={baseUrl}>
          <span className="brand-mark">26</span>
          <span>Panini Liga</span>
        </a>
        <nav className="nav" aria-label="Hauptnavigation">
          {navItems.map((item) => {
            const isActive = item.match(appPath);

            return (
              <a aria-current={isActive ? "page" : undefined} href={`${baseUrl}${item.href}`} key={item.href || "home"}>
                {item.label}
              </a>
            );
          })}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
