# Feature verification

CI and Release call one verification suite. Its installed-VSIX tests cover the README feature
inventory on Linux x64, Windows x64, and macOS arm64, using VS Code 1.100.0 and the stable version
resolved once at run start. Both package channels run in separate, fresh dark and high-contrast
profiles with accessibility support and reduced motion enabled.

`tests/feature-inventory.json` maps README claims, commands, and settings to named editor scenarios.
It also holds `declaredLanguageServices`, the twelve services the README names individually. The
policy check parses that README sentence back into names and requires it to match the inventory, and
requires every name to appear in a verification case, so a service cannot be renamed, dropped, or
left unverified without failing CI.
Each profile's `editor.json` records exact editor/platform/channel information and each scenario's
outcome. Missing cases and incomplete reports fail verification. The suite asserts provider results,
edit sets, source locations, documentation, and configuration effects through the installed extension;
unit tests and real stdio requests provide additional algorithm and protocol coverage.

| Scenario                   | Main evidence                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Lexical navigation         | Exact definitions, references, rename edits, symbols, token types, folds, and visible completion       |
| Fallback and rename safety | Useful incomplete-buffer discovery and rejection of ambiguous or unsafe edits                          |
| Game and EEex APIs         | Namespaces, typed methods, signatures, defaults, returns, rich Markdown and pinned source links        |
| Structures                 | Annotations, chained fields, narrative, source locations, offsets and byte sizes                       |
| Diagnostics and settings   | Every validation mode, debounce cancellation, severity, source filters, dialects, close cleanup        |
| Menu                       | Every advertised embedding form, custom keys, and CRLF/Unicode host ranges                             |
| Formatting                 | Exact text edits, idempotence, current config-path behavior and unchanged menu text                    |
| Commands and activation    | Real files, open-document validation, reloading changed installed data, picker cancellation and output |
| Packaged grammars          | Tokenization using the grammar files actually shipped in the VSIX                                      |
| Hover fidelity             | Byte-exact hovers for every source, rendered HTML enabled, command links disabled                      |

The required **Declared feature coverage** job runs one named case per declared service against the
bundled stdio server on Linux, Windows, and macOS, and records each outcome with its evidence in
`features-<os>/features-stdio.json`. It is a coverage gate, not a second regression suite: it proves
each named service still answers with a real result on the transport non-VS Code editors use, while
behavioural regressions stay in the stdio and installed-extension suites. A missing or failed
service fails the job.

Hover is additionally held to the published text. `tests/hover-fidelity.json` records, for
representative symbols from all six sources and every formatting construct they use, the complete
hover Markdown written from the pinned upstream source: verbatim signatures including `...` and
`???`, typographic characters, emphasis, superscripts, lists, grid and HTML tables, admonitions,
literal blocks, and cross-references resolved to pinned upstream lines. The declared-feature job
compares each one byte for byte over stdio, and the installed-extension suite compares the same
expectations as VS Code receives them. The job also audits the hover of every shipped symbol for
Markdown that would render differently from its source: leftover RST, in-page links that lead
nowhere, relative links, HTML tags editors strip, undecoded entities, doubled rules, or a missing
final source link.

The required **Pinned API regeneration** job regenerates all six sections from pinned local inputs
and requires the committed data to match byte for byte. `.github/actions/upstream-docs` checks out
EEex-Docs and LuaJIT at their pinned commits and downloads the Lua 5.2.4 archive, accepting it only
when its SHA-256 matches `packages/tools/upstream-pins.json`; no GitHub API call or token is
involved, so anonymous rate limits cannot fail the job.

Caches contain npm downloads, exact editor distributions, and versioned actionlint binaries. They
never substitute for compilation, tests, regeneration, archive audits, or fresh editor profiles.
Stable editor resolution fails visibly if the official update service is unavailable.

For a reviewable formatting/lockfile patch, dispatch **CI** with **maintenance** enabled. The optional
maintenance job does not push changes. Apply its reviewed artifact and rerun CI. After merge the
standalone Maintenance workflow can also be dispatched. All executable work runs in Actions.

This coverage does not certify every possible Lua input, pixel-level rendering, or human screen-reader
usability. Workspace operations cover open documents; rename remains within one document. Runtime
inference of arbitrary table aliases and metatable behavior is outside lexical binding analysis.

## Stable-release regressions and responsiveness

The stdio harness can suspend and reorder configuration responses. Regression cases exercise
version/session invalidation, configuration failures and recovery, separate resource settings,
shutdown with suspended work, versioned diagnostics, and atomic API reload recovery. Formatting
checks assert exact deletions and preserve literal contents, line endings, and missing final newlines.
Installed-extension cases additionally exercise untitled documents, unsupported-editor command
behavior, distinct folder settings and their invalidation, both Lua dialects, and recovery from corrupted installed API data. Native notifications
use VS Code controls; their pixel layout and screen-reader announcement are not certified.

The shared suite's required Responsiveness baseline job measures three fresh startups, twenty
completion and hover requests after warmup for each 100/1,000/10,000-line Lua and menu fixture,
three edit-to-diagnostic samples per fixture, and 100 open/change/close cycles. It records raw
milliseconds, median/p95, fixture sizes, commit, Node version, OS and architecture in
`responsiveness-baseline/responsiveness.json`. This Linux stdio baseline measures synthetic workloads;
it is not a memory-leak assessment or a latency promise for arbitrary projects. Correctness, report
completeness, clean shutdown, and a 30-second operation timeout are required; percentile values
are reported without a separate speed threshold. No workspace Lua code is executed.
