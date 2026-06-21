# Contributing

Thanks for taking an interest in Paniwi. Contributions are welcome when they keep the app reliable, clear, and easy to maintain.

## Good First Contributions

- bug fixes
- small UI improvements
- documentation updates
- test coverage for existing behavior
- data quality fixes for teams, rosters, matches, or goals

## Workflow

1. Open or pick an issue when the change needs discussion.
2. Create a short-lived feature branch from `master`.
3. Keep the change focused.
4. Run the relevant checks.
5. Open a pull request into `master`.

`master` is the stable branch used for the GitHub Pages build. Small maintainer updates may be committed directly when that keeps the project moving, but pull requests should target `master`.

## Checks

Before opening a pull request, run:

```powershell
npm test
npm run build
```

For data-related changes, also run the matching sync or snapshot command:

```powershell
npm run test:snapshots
npm run sync:data
```

## Data and Secrets

Do not commit API tokens, runner credentials, or local secrets. GitHub Actions use repository secrets and variables for production-like sync runs.

Generated files in `public/data` should only be committed when the change is intentional and can be explained in the pull request.

## Style

- Prefer clear names over clever abstractions.
- Keep modules small and focused.
- Avoid unrelated refactors in feature or bug-fix pull requests.
- Add or update tests when behavior changes.
