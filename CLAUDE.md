# General Repository Instructions

## Working standard

- Be professional, precise, and evidence-driven. Inspect the repository before proposing or making
  changes, and ask for clarification when product intent cannot be established from repository
  evidence.
- Never speculate about APIs, platform behavior, dependency versions, release state, or security
  properties. Use authoritative project files and upstream primary documentation.
- Preserve unrelated worktree changes. Do not rewrite, delete, or reformat files outside the
  requested scope.
- Add detailed, accurate inline comments for non-obvious security boundaries, lifecycle behavior, compatibility
  decisions, workflow constraints, and **all** source code files (TypeScript, JavaScript, YAML and the like). Do not add comments that merely restate the code.
- Keep changes focused and reviewable. Avoid unrelated cleanup, premature abstractions, and copied
  implementations whose licensing or provenance is unclear.

## Verification policy

- Never run tasks, tests, builds, or packaging commands locally.
  Use the repository's GitHub Actions workflows for all executable verification.
- Local verification is limited to read-only inspection and non-executing checks such as reviewing
  diffs, file modes, and repository status. Source editing and Git operations are permitted.
  Dependency installation, formatters, generators, and executable feature checks run in Actions.
- Do not present a change as verified until the relevant GitHub Actions jobs pass. Record unavailable
  or intentionally skipped workflow coverage explicitly in the pull request.

## Sources of truth

- `VERSION` is the application version source. Keep root/workspace manifests, internal dependency
  versions, lockfile metadata, and the latest prepared `CHANGELOG.md` entry consistent with it.
- `SECURITY.md`, `docs/architecture/THREAT_MODEL.md`, and `docs/release/READINESS.md` define the
  security and release gates. Update them when a change alters a documented boundary.

## Product and architecture invariants

- This is a TypeScript npm workspace: `client` owns VS Code integration, `server` owns LSP
  handlers, `shared` owns parsing/settings/API contracts, and `tools` owns generation and audits.
- Use Node.js 24 for tooling and standalone stdio clients. Preserve VS Code 1.100 compatibility;
  keep VS Code API types aligned with that minimum and test both the minimum and stable editor.
- VS Code starts the bundled server over IPC; other clients use `--stdio`. Keep stdout reserved
  for protocol messages. The client owns command registration; do not advertise duplicate commands.
- Treat a document as `.menu` when its language id says so or its URI ends in `.menu`. Editors
  configured by hand routinely send their own id, and a wrong id must not silently disable embedded
  Lua. API symbols resolve to upstream documentation URLs; the VS Code client opens those externally
  rather than handing the editor a location it cannot open.
- Preserve Lua 5.2 and LuaJIT behavior, embedded `.menu` source mappings, validation modes, and
  same-document rename. Workspace validation currently covers open documents.
- Generate six API source sections using schema-v3 category shards and immutable upstream commit
  and line provenance. Preserve the loader's legacy manifest compatibility. Never guess API prose.
- Declare the source section identifiers and the semantic token legend once in `shared/types.ts`.
  The manifest contributions, the shipped index and the packaging audit are checked against them,
  and documented provenance is checked against the manifest rather than maintained by hand.
- Parse upstream documentation as data; never execute upstream code or workspace Lua files.
- The formatter currently trims Lua trailing whitespace and leaves `.menu` documents unchanged;
  the formatter configuration setting does not imply an external formatter implementation.
- UI strings currently use English without locale bundles. Preserve accessibility settings and
  existing native VS Code controls; introduce locale resources only with an intentional UI change.

## Change and review conventions

- Use Conventional Commits with the repository's allowed types and a subject no longer than 100
  characters. Keep commits independently understandable.
- Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
  `chore`, and `revert`. PR titles must satisfy the same rule for squash merges.
- Update automated coverage when behavior changes. Use the closest existing unit or instrumentation
  test style and execute it only through GitHub Actions.
- Every language service named in the README's feature list needs an entry in
  `tests/feature-inventory.json` and a case in the declared-coverage suite; the policy check fails
  when the published list and the verification inventory disagree.
- Preserve every supported locale when changing user-visible strings. UI changes must account for
  accessibility settings.
- Keep GitHub Actions permissions minimal, pin third-party actions by full commit SHA, and never put
  credentials or signing material in the repository, logs, artifacts, or pull request text.
- Update third-party notices when shipped dependency or licensing obligations change. Build-only
  dependency remediation does not alter the application bundle's notice inventory.
