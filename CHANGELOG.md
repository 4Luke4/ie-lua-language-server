# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [v0.3.1]

### Added

- Add Codex-assisted remediation for open CodeQL alerts after successful default-branch scans, with read-only alert collection, isolated patch generation, and reviewable pull requests.

### Changed

- Make VSIX packaging and release publication manually initiated, with explicit release-type and tag inputs, strict version/channel validation, and automated publication of the same audited package to the Visual Studio Marketplace and GitHub Releases.
- Verify that `VSCE_PAT` has publish rights for the configured Marketplace publisher before creating a draft GitHub release.

## [v0.3.0]

### Added

- Add a conservative Dependabot auto-merge policy for verified patch updates after CI and CodeQL succeed for the exact pull request commit.
- Resolve unambiguous colon-method calls such as `value:upper()` in hover, signature help, and API definitions while preserving exact dotted-name lookup.

### Changed

- Replace the retired dynamic Visual Studio Marketplace badge with a stable Marketplace install badge.

## [v0.2.0]

### Added

- Allow users to configure the type-validation debounce delay, with a 300 ms default and guidance about responsiveness and CPU usage tradeoffs.
- Add weekly Dependabot updates for npm packages and GitHub Actions.
- Add CI, CodeQL, and Visual Studio Marketplace badges to the README.

## [v0.1.4]

### Changed

- Migrate repository links, contribution templates, CI, security analysis, and release automation from GitLab to GitHub.

## [v0.1.3]

### Fixed

- Use the GitLab CLI already present in the release job image to upload VSIX release assets when `curl` is unavailable.

## [v0.1.2]

### Added

- Add a generated Marketplace icon and matching gallery banner metadata.

### Changed

- Publish GitLab release and prerelease VSIX downloads as release asset links backed by the Generic Package Registry.
- Hide intermediate package-job VSIX artifacts from direct UI/API download while still passing them to release jobs.

## [v0.1.1]

### Fixed

- Prevent VS Code activation failures caused by duplicate `ieLua.*` command registration during language server initialization.

## [v0.1.0]

### Added

- TypeScript VS Code extension client and IPC/stdio language server scaffold.
- Lua and `.menu` parsing, validation scheduling, symbol extraction, folding, completion, hover, signature help, references, same-file rename, formatting, and semantic tokens.
- Sectioned API data manifest with six auditable source files and permission-gated documentation handling.
- Kate LSP setup files, screenshots, package audit tooling, and GitLab CI packaging/publishing jobs.
