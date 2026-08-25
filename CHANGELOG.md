# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [v0.5.1]

### Added

- Ship the 139 `Infinity_*` functions defined directly in the upstream category index, with documentation and pinned line-level provenance.
- Add schema-v3 compatibility coverage for upstream-category shards while retaining schema-v1 and schema-v2 runtime loading.

### Changed

- Split EE Game Lua functions, EEex functions, and EE Game Structures (x64) into auditable JSON shards discovered from the pinned upstream toctrees, including explicit empty-category shards.
- Strengthen package auditing across recursive shards, aggregate counts, metadata, provenance, global symbol identity, and orphaned generated files.
- Update scheduled EEex refreshes to report manifest aggregate counts independently of generated shard names.

## [v0.5.0]

### Added

- Ship complete, source-discovered EE Game Lua and EEex function metadata with canonical callable names, signatures, typed parameters, defaults, returns, documented instance aliases, hover help, signature help, completion, and pinned definitions.
- Preserve official function documentation formatting as VS Code Markdown, including paragraphs, emphasis, lists, tables, summaries, warnings, notes, references, raw line breaks, and code examples.
- Add strict parser fixtures, schema-v2 compatibility coverage, source-to-output completeness checks, and stronger package auditing for function metadata and provenance.

### Changed

- Correct filename-style game function aliases such as `C_AddGold` to callable identities such as `C:AddGold`, and keep colon-delimited EEex methods distinct.
- Extend scheduled EEex updates to regenerate and report complete function documentation alongside structure metadata.
- Document a reproducible 1440x900 capture recipe for README completion, hover, diagnostics, and symbols screenshots using Visual Studio Code's built-in Monokai theme.

## [v0.4.0]

### Added

- Ship full permission-safe EE Game Structures (x64) layouts with 1,040 structures and 7,195 fields, including annotation-aware and chained member completion, hover, source definitions, types, offsets, and byte sizes.
- Add a scheduled, manually dispatchable workflow that detects new EEex upstream revisions, regenerates and verifies API metadata without executing upstream code, and opens a reviewable pull request.
- Enforce Conventional Commit headers across every commit in a pull request.

### Changed

- Reconcile every path-labeler label from trusted base-branch definitions before applying labels.
- Audit GitHub Actions responsibilities, retain the distinct non-redundant workflows, and declare the package-lock cache input explicitly for npm-based CI and release builds.
- Configure Dependabot commit prefixes to remain compatible with Conventional Commits.
- Replace illustrative screenshot assets with genuine Visual Studio Code captures in a collapsed README section.
- Add latest-release, all-release download, and latest-release download badges.
- Resolve EEex revisions dynamically for automated updates while recording immutable commit and line-level provenance in every generated symbol.

## [v0.3.1]

### Added

- Add automatic, deduplicated GitHub issue tracking for open default-branch CodeQL alerts, including severity-aware labels and automatic resolution when no findings remain.

### Changed

- Make VSIX packaging and GitHub release publication manually initiated, with explicit release-type and tag inputs, strict version/channel validation, and publication of the selected audited package on GitHub Releases.
- Keep Visual Studio Marketplace publication separate and manually managed by removing Marketplace credentials and publishing from GitHub Actions.
- Remove the redundant standalone Package workflow.

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
