# Feature verification

CI and Release call one verification suite. Its installed-VSIX tests cover the README feature
inventory on Linux x64, Windows x64, and macOS arm64, using VS Code 1.100.0 and the stable version
resolved once at run start. Both package channels run in separate, fresh dark and high-contrast
profiles with accessibility support and reduced motion enabled.

`tests/feature-inventory.json` maps README claims, commands, and settings to named editor scenarios.
Each profile's `editor.json` records exact editor/platform/channel information and each scenario's
outcome. Missing cases and incomplete reports fail verification. The suite asserts provider results,
edit sets, source locations, documentation, and configuration effects through the installed extension;
unit tests and real stdio requests provide additional algorithm and protocol coverage.

| Scenario | Main evidence |
| --- | --- |
| Lexical navigation | Exact definitions, references, rename edits, symbols, token types, folds, and visible completion |
| Fallback and rename safety | Useful incomplete-buffer discovery and rejection of ambiguous or unsafe edits |
| Game and EEex APIs | Namespaces, typed methods, signatures, defaults, returns, rich Markdown and pinned source links |
| Structures | Annotations, chained fields, narrative, source locations, offsets and byte sizes |
| Diagnostics and settings | Every validation mode, debounce cancellation, severity, source filters, dialects, close cleanup |
| Menu | Every advertised embedding form, custom keys, and CRLF/Unicode host ranges |
| Formatting | Exact text edits, idempotence, current config-path behavior and unchanged menu text |
| Commands and activation | Real files, open-document validation, reloading changed installed data, picker cancellation and output |
| Packaged grammars | Tokenization using the grammar files actually shipped in the VSIX |

Caches contain npm downloads, exact editor distributions, and versioned actionlint binaries. They
never substitute for compilation, tests, regeneration, archive audits, or fresh editor profiles.
Stable editor resolution fails visibly if the official update service is unavailable.

For a reviewable formatting/lockfile patch, dispatch **CI** with **maintenance** enabled. The optional
maintenance job does not push changes. Apply its reviewed artifact and rerun CI. After merge the
standalone Maintenance workflow can also be dispatched. All executable work runs in Actions.

This coverage does not certify every possible Lua input, pixel-level rendering, or human screen-reader
usability. Workspace operations cover open documents; rename remains within one document. Runtime
inference of arbitrary table aliases and metatable behavior is outside lexical binding analysis.
