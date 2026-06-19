import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { StaticMeta } from "../../domain/staticMeta";
import { StatusPill } from "./StatusPill";

type AppShellProps = {
  children: ReactNode;
  meta?: StaticMeta;
  partyColors?: string[];
};

const navItems = [
  { href: "", label: "Home", match: (path: string) => path === "/" },
  { href: "table", label: "Tabelle", match: (path: string) => path === "/table" || path === "/leaderboard" },
  { href: "goals", label: "Torjäger", match: (path: string) => path === "/goals" },
  { href: "matches", label: "Spiele", match: (path: string) => path === "/matches" }
];

const basePartyColors = ["#d72638", "#ffcf33", "#1f7a4d", "#1d4ed8", "#f97316", "#ffffff"] as const;
const confettiCount = 164;
const confettiCooldownMs = 650;

type PartyLight = {
  color: string;
  delay: number;
  left: number;
  size: number;
  top: number;
};

type PartyPiece = {
  color: string;
  delay: number;
  drift: number;
  duration: number;
  fall: number;
  left: number;
  rotate: number;
  size: number;
  wide: boolean;
};

type PartyBurst = {
  id: number;
  lights: PartyLight[];
  pieces: PartyPiece[];
};

function buildPartyPalette(accentColors: string[] = []): string[] {
  const uniqueAccentColors = [...new Set(accentColors)];
  const accentWeight = uniqueAccentColors.length === 1 ? 8 : 5;
  return [
    ...uniqueAccentColors.flatMap((color) => Array.from({ length: accentWeight }, () => color)),
    ...basePartyColors
  ];
}

function pickPartyColor(index: number, palette: string[]): string {
  return palette[index % palette.length];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createPartyBurst(accentColors: string[] = []): PartyBurst {
  const id = Date.now();
  const palette = buildPartyPalette(accentColors);
  const lights = Array.from({ length: 11 }, (_, index) => ({
    color: pickPartyColor(index + Math.floor(Math.random() * palette.length), palette),
    delay: index * 0.08 + randomBetween(0, 0.08),
    left: randomBetween(5, 95),
    size: randomBetween(88, 146),
    top: randomBetween(10, 88)
  }));
  const pieces = Array.from({ length: confettiCount }, (_, index) => ({
    color: pickPartyColor(index + Math.floor(Math.random() * palette.length), palette),
    delay: randomBetween(0, 0.82),
    drift: randomBetween(-36, 36),
    duration: randomBetween(1.45, 2.75),
    fall: randomBetween(74, 116),
    left: randomBetween(-4, 104),
    rotate: randomBetween(160, 820),
    size: randomBetween(5, 10),
    wide: Math.random() > 0.68
  }));

  return { id, lights, pieces };
}

export function AppShell({ children, meta, partyColors }: AppShellProps) {
  const [confettiBursts, setConfettiBursts] = useState<PartyBurst[]>([]);
  const lastConfettiLaunch = useRef(0);
  const baseUrl = import.meta.env.BASE_URL;
  const basePath = baseUrl.replace(/\/$/, "");
  const appPath =
    basePath && window.location.pathname.startsWith(basePath)
      ? window.location.pathname.slice(basePath.length) || "/"
      : window.location.pathname;

  function launchConfetti(): void {
    const now = Date.now();
    if (now - lastConfettiLaunch.current < confettiCooldownMs) {
      return;
    }

    lastConfettiLaunch.current = now;
    const burst = createPartyBurst(partyColors);
    setConfettiBursts([burst]);
    window.setTimeout(() => {
      setConfettiBursts((current) => current.filter((currentBurst) => currentBurst.id !== burst.id));
    }, 3000);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-main">
          <button aria-label="Konfetti starten" className="brand" onClick={launchConfetti} type="button">
            <span className="brand-mark">WM 2026</span>
            <span className="brand-name">Panini Liga</span>
          </button>
          {meta ? <StatusPill meta={meta} /> : null}
        </div>
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
      {confettiBursts.map((burst) => (
        <div aria-hidden="true" className="confetti-overlay" key={burst.id}>
          {burst.lights.map((light, index) => (
            <span
              className="party-light"
              key={`light-${index}`}
              style={{
                "--confetti-color": light.color,
                "--confetti-delay": `${light.delay}s`,
                "--confetti-left": `${light.left}vw`,
                "--confetti-light-size": `${light.size}vmax`,
                "--confetti-top": `${light.top}vh`
              } as CSSProperties}
            />
          ))}
          {burst.pieces.map((piece, index) => (
            <span
              className={piece.wide ? "confetti-piece confetti-piece-wide" : "confetti-piece"}
              key={`piece-${index}`}
              style={{
                "--confetti-color": piece.color,
                "--confetti-delay": `${piece.delay}s`,
                "--confetti-drift": `${piece.drift}vw`,
                "--confetti-duration": `${piece.duration}s`,
                "--confetti-fall": `${piece.fall}vh`,
                "--confetti-left": `${piece.left}vw`,
                "--confetti-rotate": `${piece.rotate}deg`,
                "--confetti-size": `${piece.size}px`
              } as CSSProperties}
            />
          ))}
        </div>
      ))}
      <main className="app-main">{children}</main>
    </div>
  );
}
