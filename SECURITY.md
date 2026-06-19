# Security Policy

## Supported Versions

The current `master` branch is the supported version of this project.

## Reporting a Vulnerability

Please report security issues privately through the maintainer's GitHub profile instead of opening a public issue.

Useful details include:

- a short description of the issue
- steps to reproduce it
- affected files, workflows, or pages
- whether a token, runner, or deployment process may be involved

## Secrets

Do not commit API tokens or credentials. Production-like data syncs use GitHub Actions secrets and repository variables.

If a secret is exposed, revoke or rotate it first, then open a private report with the relevant context.
