# Contributing

This repository is proprietary unless maintainers state otherwise in writing.

## Requirements

- Node.js 24 LTS.
- npm bundled with Node.js 24.
- Visual Studio Code compatible with `^1.100.0`.
- Kate with the LSP Client plugin when validating stdio LSP behavior outside Visual Studio Code.

## Workflow

1. Create a focused branch.
2. Use Conventional Commits for commit messages.
3. Run `npm run verify` before opening a pull request.
4. Keep generated API data provenance intact.
5. Do not add undocumented or guessed API help text.
6. Follow `docs/release.md` for VSIX packaging and GitHub release or prerelease work.

## Pull Requests

Pull requests should describe:

- User-facing behavior.
- Validation performed.
- Any generated data changes and their upstream source.
- Security, licensing, or marketplace impact.
