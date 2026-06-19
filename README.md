# Paniwi

Paniwi is a small World Cup 2026 companion app for a Panini-style sticker league.
Each participant builds a team from their stickers, and the site turns the tournament into a shared scoreboard: standings, goals, player involvement, match views, and hints for games that are especially worth watching.

The app is built as a static React site and is designed to run well on GitHub Pages.

## Features

- leaderboard and scoring for participant teams
- goal feed with resolved Panini teams and player names
- match overview with live, upcoming, and finished sections
- player and team views for sticker-team context
- static JSON snapshots in `public/data`
- scheduled data sync through GitHub Actions
- test coverage for scoring, matching, sync, and snapshot consistency

## Tech Stack

- React 18
- TypeScript
- Vite
- `tsx` scripts for data sync and tests
- GitHub Actions for CI, Pages deploy, and scheduled/manual data updates

## Getting Started

```powershell
npm install
npm run dev
```

Useful commands:

```powershell
npm test
npm run build
npm run preview
npm run sync:data
npm run sync:scheduled
npm run sync:rosters
```

Local dev server defaults to Vite. The production build is written to `dist`.

## Data Flow

The frontend does not call football APIs directly. Sync scripts collect and normalize source data, then write static JSON snapshots to `public/data`.

Important snapshots:

- `leaderboard.json`
- `goals.json`
- `matches.json`
- `scorers.json`
- `raw-goals.json`
- `rosters.json`
- `meta.json`

`npm run test:snapshots` rebuilds the derived snapshots and checks that committed data stays consistent.

## Sync Sources

The sync layer supports multiple source modes:

```powershell
$env:SYNC_SOURCE="mock"; npm run sync:data
$env:SYNC_SOURCE="football-data"; npm run sync:data
$env:SYNC_SOURCE="api-football-enrich"; npm run sync:data
$env:SYNC_SOURCE="wikipedia"; npm run sync:data
```

For local experiments, `.env.example` documents the available settings. Production-like sync runs are handled by GitHub Actions using repository secrets and variables, for example API tokens and request limits.

## GitHub Pages and Actions

- `ci.yml` runs tests and build checks on pushes and pull requests.
- `deploy.yml` builds and publishes the static site to GitHub Pages.
- `sync-data.yml` runs on a self-hosted runner for controlled data updates.
- `sync-rosters.yml` updates roster snapshots when run manually.

The deployed Pages site is built from the committed snapshots plus the current app code. If a sync finds no data changes, it leaves the existing snapshots untouched.

## Scoring

- Regular goals: 1 point
- Penalties during the match: 1 point
- Own goals: 0 points
- Penalty shootouts: 0 points

Only resolved tournament events affect the score. Roster and nomination data provide context, but points are event-based.

## Branch Flow

The stable Pages branch is `master`. Ongoing work should happen on feature branches and be opened as pull requests into `dev`. Once `dev` is ready, it can be merged into `master` for release.

## Contributing

Issues and pull requests are welcome, especially for bug reports, data quality fixes, small UI improvements, and documentation updates. Please keep changes focused and run the relevant tests before opening a pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the short project workflow.
