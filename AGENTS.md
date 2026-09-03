# General Repository Instructions

## Working standard

- Be professional, precise, and evidence-driven. Inspect the repository before proposing or making
  changes, and ask for clarification when product intent cannot be established from repository
  evidence.
- Never speculate about APIs, platform behavior, dependency versions, release state, or security
  properties. Use authoritative project files and upstream primary documentation.
- Preserve unrelated worktree changes. Do not rewrite, delete, or reformat files outside the
  requested scope.
- Add concise inline comments for non-obvious security boundaries, lifecycle behavior, compatibility
  decisions, and workflow constraints. Do not add comments that merely restate the code.
- Keep changes focused and reviewable. Avoid unrelated cleanup, premature abstractions, and copied
  implementations whose licensing or provenance is unclear.

## Verification policy

- Never run tasks, tests, builds, or packaging commands locally.
  Use the repository's GitHub Actions workflows for all executable verification.
- Local work is limited to read-only inspection and non-executing checks such as reviewing diffs,
  file modes, and repository status.
- Do not present a change as verified until the relevant GitHub Actions jobs pass. Record unavailable
  or intentionally skipped workflow coverage explicitly in the pull request.

## Sources of truth

- `VERSION` is the application version source. Keep it consistent with `CHANGELOG.md` and localized
  resources through the existing validation scripts.
- `SECURITY.md`, `docs/architecture/THREAT_MODEL.md`, and `docs/release/READINESS.md` define the
  security and release gates. Update them when a change alters a documented boundary.

## Product and architecture invariants

## Change and review conventions

- Use Conventional Commits with the repository's allowed types and a subject no longer than 100
  characters. Keep commits independently understandable.
- Update automated coverage when behavior changes. Use the closest existing unit or instrumentation
  test style and execute it only through GitHub Actions.
- Preserve every supported locale when changing user-visible strings. UI changes must account for
  accessibility settings.
- Keep GitHub Actions permissions minimal, pin third-party actions by full commit SHA, and never put
  credentials or signing material in the repository, logs, artifacts, or pull request text.
- Update third-party notices when shipped dependency or licensing obligations change. Build-only
  dependency remediation does not alter the application bundle's notice inventory.
