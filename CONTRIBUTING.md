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
2. Create a feature branch from `dev`.
3. Keep the change focused.
4. Run the relevant checks.
5. Open a pull request into `dev`.

`master` is the stable branch used for the GitHub Pages build. Regular development should go through `dev`; direct maintainer commits to `master` are reserved for small operational updates.

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
