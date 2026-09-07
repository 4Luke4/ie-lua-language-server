# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.3] - Unreleased

### Added

- Include upstream structure narrative in API documentation.
- Add exact installed-VSIX coverage for every advertised feature on Linux, macOS, and Windows.
- Verify protocol, editor integration, package archives, and release readiness through GitHub Actions.

### Changed

- Complete repository instructions, version validation, and required workflow gates.
- Keep CodeQL updates together and preserve the VS Code 1.100 API baseline.
- Reuse one package build for both channels and cache versioned editor and workflow tooling downloads.
- Make formatting and lockfile maintenance opt-in.

### Fixed

- Resolve Lua references by lexical binding, preventing rename from changing shadowed variables, comments, or strings.
- Analyze embedded Lua independently of the surrounding menu DSL and preserve host-document source locations.

### Removed

- Retire obsolete workflow registrations.

## [0.5.2] - 2026-08-26

### Added

- Add dedicated README screenshots for EEex signature help and annotation-aware EE Game Structures (x64) member completion.

### Changed

- Refresh all README screenshots in Visual Studio Code's official built-in Monokai theme, with completion and hover now exercising generated EEex metadata.
- Expand the reproducible capture recipe to verify the exact theme and expected language-server results before capturing all six feature views.

### Fixed

- Render API hover, completion, and signature documentation with real Markdown line breaks instead of displaying escaped newline text.
- Render signature parameter descriptions as Markdown so code spans and links display correctly.

## [0.5.1] - 2026-08-25

### Added

- Ship the 139 `Infinity_*` functions defined directly in the upstream category index, with documentation and pinned line-level provenance.
- Add schema-v3 compatibility coverage for upstream-category shards while retaining schema-v1 and schema-v2 runtime loading.

### Changed

- Split EE Game Lua functions, EEex functions, and EE Game Structures (x64) into auditable JSON shards discovered from the pinned upstream toctrees, including explicit empty-category shards.
- Strengthen package auditing across recursive shards, aggregate counts, metadata, provenance, global symbol identity, and orphaned generated files.
- Update scheduled EEex refreshes to report manifest aggregate counts independently of generated shard names.

## [0.5.0] - 2026-08-25

### Added

- Ship complete, source-discovered EE Game Lua and EEex function metadata with canonical callable names, signatures, typed parameters, defaults, returns, documented instance aliases, hover help, signature help, completion, and pinned definitions.
- Preserve official function documentation formatting as VS Code Markdown, including paragraphs, emphasis, lists, tables, summaries, warnings, notes, references, raw line breaks, and code examples.
- Add strict parser fixtures, schema-v2 compatibility coverage, source-to-output completeness checks, and stronger package auditing for function metadata and provenance.

### Changed

- Correct filename-style game function aliases such as `C_AddGold` to callable identities such as `C:AddGold`, and keep colon-delimited EEex methods distinct.
- Extend scheduled EEex updates to regenerate and report complete function documentation alongside structure metadata.
- Document a reproducible 1440x900 capture recipe for README completion, hover, diagnostics, and symbols screenshots using Visual Studio Code's built-in Monokai theme.

## [0.4.0] - 2026-08-24

### Added

- Ship full EE Game Structures (x64) layouts with 1,040 structures and 7,195 fields, including annotation-aware and chained member completion, hover, source definitions, types, offsets, and byte sizes.
- Add a scheduled, manually dispatchable workflow that detects new EEex upstream revisions, regenerates and verifies API metadata without executing upstream code, and opens a reviewable pull request.
- Enforce Conventional Commit headers across every commit in a pull request.

### Changed

- Reconcile every path-labeler label from trusted base-branch definitions before applying labels.
- Audit GitHub Actions responsibilities, retain the distinct non-redundant workflows, and declare the package-lock cache input explicitly for npm-based CI and release builds.
- Configure Dependabot commit prefixes to remain compatible with Conventional Commits.
- Replace illustrative screenshot assets with genuine Visual Studio Code captures in a collapsed README section.
- Add latest-release, all-release download, and latest-release download badges.
- Resolve EEex revisions dynamically for automated updates while recording immutable commit and line-level provenance in every generated symbol.

## [0.3.1] - 2026-08-04

### Changed

- Make VSIX packaging and GitHub release publication manually initiated, with explicit release-type and tag inputs, strict version/channel validation, and publication of the selected audited package on GitHub Releases.
- Keep Visual Studio Marketplace publication separate and manually managed by removing Marketplace credentials and publishing from GitHub Actions.
- Remove the redundant standalone Package workflow.

## [0.3.0] - 2026-08-03

### Added

- Add a conservative Dependabot auto-merge policy for verified patch updates after CI and CodeQL succeed for the exact pull request commit.
- Resolve unambiguous colon-method calls such as `value:upper()` in hover, signature help, and API definitions while preserving exact dotted-name lookup.

### Changed

- Replace the retired dynamic Visual Studio Marketplace badge with a stable Marketplace install badge.

## [0.2.0] - 2026-08-03

### Added

- Allow users to configure the type-validation debounce delay, with a 300 ms default and guidance about responsiveness and CPU usage tradeoffs.
- Add weekly Dependabot updates for npm packages and GitHub Actions.
- Add CI, CodeQL, and Visual Studio Marketplace badges to the README.

## [0.1.4] - 2026-08-03

### Changed

- Migrate repository links, contribution templates, CI, security analysis, and release automation from GitLab to GitHub.

## [0.1.3] - 2026-07-13

### Fixed

- Use the GitLab CLI already present in the release job image to upload VSIX release assets when `curl` is unavailable.

## [0.1.2] - 2026-07-13

### Added

- Add a generated Marketplace icon and matching gallery banner metadata.

### Changed

- Publish GitLab release and prerelease VSIX downloads as release asset links backed by the Generic Package Registry.
- Hide intermediate package-job VSIX artifacts from direct UI/API download while still passing them to release jobs.

## [0.1.1] - 2026-07-12

### Fixed

- Prevent VS Code activation failures caused by duplicate `ieLua.*` command registration during language server initialization.

## [0.1.0] - 2026-07-11

### Added

- TypeScript VS Code extension client and IPC/stdio language server scaffold.
- Lua and `.menu` parsing, validation scheduling, symbol extraction, folding, completion, hover, signature help, references, same-file rename, formatting, and semantic tokens.
- Sectioned API data manifest with six auditable source files and source-attributed documentation.
- Kate LSP setup files, screenshots, package audit tooling, and GitLab CI packaging/publishing jobs.

Historical dates identify repository preparation milestones; linked tags identify published prereleases where available.

[0.5.3]: https://github.com/4Luke4/ie-lua-language-server/pull/58
[0.5.2]: https://github.com/4Luke4/ie-lua-language-server/tree/b5726a321d5d806377e4e5a73041ce1eaa280203
[0.5.1]: https://github.com/4Luke4/ie-lua-language-server/tree/28d1b1dace7cc2520d5ee68b5dfce7746c2de7a3
[0.5.0]: https://github.com/4Luke4/ie-lua-language-server/tree/v0.5.0-alpha.5
[0.4.0]: https://github.com/4Luke4/ie-lua-language-server/tree/a043758d7965644cc19f3d15981cc94b20a20fb4
[0.3.1]: https://github.com/4Luke4/ie-lua-language-server/tree/v0.3.1-alpha.3
[0.3.0]: https://github.com/4Luke4/ie-lua-language-server/tree/246a90cc19483491562024c174e8f36284fbd76a
[0.2.0]: https://github.com/4Luke4/ie-lua-language-server/tree/e0d337a88eff11e7cd27cfca36f742860ef36786
[0.1.4]: https://github.com/4Luke4/ie-lua-language-server/tree/12e67a01ae0bc29088b06904b48c8531ae469e32
[0.1.3]: https://github.com/4Luke4/ie-lua-language-server/tree/v0.1.3-alpha.1
[0.1.2]: https://github.com/4Luke4/ie-lua-language-server/tree/v0.1.2-alpha.1
[0.1.1]: https://github.com/4Luke4/ie-lua-language-server/tree/v0.1.1-alpha.1
[0.1.0]: https://github.com/4Luke4/ie-lua-language-server/tree/v0.1.0-alpha.1
