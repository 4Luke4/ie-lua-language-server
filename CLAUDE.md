# Repository Instructions

## Working standard

- Be professional, precise, and evidence-driven. Inspect the repository before proposing or making
  changes, and ask for clarification when product intent cannot be established from repository
  evidence.
- Never speculate about APIs, platform behavior, dependency versions, release state, or security
  properties. Use authoritative project files and upstream primary documentation.
- Preserve unrelated worktree changes. Do not rewrite, delete, or reformat files outside the
  requested scope.
- Add rich, detailed, and accurate inline comments across *all* source code files.
  Do not add comments that merely restate the code.
- Keep changes focused and reviewable. Avoid unrelated cleanup, premature abstractions, and copied
  implementations whose licensing or provenance is unclear.

## File structure

- Never put multiple unrelated classes, composables, or responsibilities in one file.
- One top-level class/object/whatever per file, named after the file.
- Keep files under ~500 lines. If a file grows past that, split it before adding more.
- Before writing code for a new feature, list the files you will create and what each one is responsible for.

## Verification policy

Verification is hybrid: the local machine runs the inner development loop, and GitHub Actions is
the authoritative gate.

- Locally, run the Python script tests and validators, npm tests,
  and the like (commands in `CONTRIBUTING.md`). Iterate there before pushing.
  Blender (with the GPU) remains available for assets.
  `scripts/clean_local.py` removes regenerable local build output.
- Never commit machine-specific paths or settings.
- Local results are evidence, not verification: local JDKs, SDK packages, and devices can differ
  from the pinned CI toolchain. Do not present a change as verified until the relevant GitHub Actions
  jobs pass. In the pull request, record what ran locally, and list coverage that is unavailable or
  intentionally skipped (for example, release modes that need the protected `release` environment).
- Never run release publishing (Google Play uploads, signing with real keys) locally. It exists only
  in the `release` environment of `.github/workflows/release.yml`.
- When debugging, always test all possible edge/tricky cases.

## Sources of truth

- `VERSION` is the application version source. Keep it consistent with `CHANGELOG.md`,
  the localized vscode release notes, and the like.
- `SECURITY.md`, `docs/architecture/THREAT_MODEL.md`, and `docs/release/READINESS.md` define the
  security and release gates. Update them when a change alters a documented boundary.

## Product and architecture invariants

## Change and review conventions

- Use Conventional Commits with the repository's allowed types and a subject no longer than 100
  characters. Keep commits independently understandable.
- Preserve every supported locale when changing user-visible strings. UI changes must account for
  accessibility, keyboard, mouse, touch, and adaptive tablet/smartphone layout behavior.
- Keep GitHub Actions permissions minimal and never put credentials or signing material in the repository,
  logs, artifacts, or pull request text.
- Update third-party notices when shipped dependency or licensing obligations change.
