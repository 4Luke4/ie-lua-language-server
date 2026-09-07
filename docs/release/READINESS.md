# Release readiness

- `VERSION`, package/workspace metadata, lockfile metadata, and the prepared changelog version agree.
- The final revision passes `Verify`, CodeQL analysis, dependency review, and commit conventions.
- CI covers Linux, Windows, and macOS, plus VS Code 1.100.0 and stable. Attach exact run links;
  missing, cancelled, or skipped required coverage is not a pass.
- Every scenario in the [feature inventory](../verification.md) passes for both package channels
  and both accessibility profiles. Downloadable reports identify the tested editor versions.
- The responsiveness job completes all fixed workloads, with passing correctness checks and a
  downloadable report. Timings establish a baseline, not a latency or memory-use guarantee.
- For 0.6.0, review the compatibility contract and acceptance record in [0.6.0.md](0.6.0.md).
- Generated API data passes pinned regeneration, source/count audits, and documentation tests.
- Both package channels pass archive inspection and installed-extension checks. The release's
  selected channel additionally satisfies tag syntax, version matching, and odd/even minor policy.
- Release dry-run succeeds for the selected revision before publication. Only the audited artifact
  is published; publication remains manual and never targets an existing tag or release.
- Runtime dependency notice obligations and any changed boundaries in SECURITY.md and the threat
  model are reviewed. Local game samples, development files, and secrets are absent from the VSIX.
- Record remaining coverage limits explicitly: no Kate GUI automation, screen-reader usability
  certification, or additional CPU architectures beyond the runner matrix.

Use the Actions UI to inspect failures and download VSIX, logs, and maintenance patches. Apply
reviewed changes and rerun Actions; do not run verification, installation, or packaging locally.
