# Release and prerelease publishing

All installation, verification, generation, formatting, and packaging run in GitHub Actions.
Download verified VSIX files from a CI run for use with VS Code or stdio clients.

## Version policy

`VERSION` is authoritative. Root/workspace manifests, internal dependencies, lockfile metadata,
and the latest prepared changelog entry must agree. Use numeric `major.minor.patch` versions;
Marketplace prereleases use a package flag, not a version suffix. Odd minor versions are
prereleases; even minor versions are stable. CI tests both packaging paths independently of
publication eligibility.

Stable tags use `vX.Y.Z`. Prerelease tags use `vX.Y.Z-{alpha|beta|rc|pre|preview}.N`. Tags must match
`VERSION` and their channel. Existing tags and releases are rejected rather than replaced.

## Verification and publication

1. Prepare changes on a branch and open a draft PR. Inspect CI, CodeQL, dependency review, and
   commit-policy results for its final revision. Download maintenance artifacts to review/apply
   formatting, lockfile, or generated-data changes; rerun Actions after applying them.
2. Follow `release/READINESS.md`. Verify installed VSIX results across the supported runner/editor
   matrix and record any unavailable coverage explicitly.
3. Run **Actions → Release → Run workflow**, choose the branch, release type, matching tag, and
   leave **dry_run** enabled. This validates prerequisites and runs the shared complete suite,
   without creating a tag or release.
4. Merge the verified PR. Run Release on that merged default-branch commit with **dry_run** disabled
   only when publication is intended. Publication checks the merged PR's validation and publishes
   the exact artifact produced by that run. A failed upload leaves a draft for maintainer inspection;
   the workflow does not overwrite or delete a previous release.

Publication uses the repository `GITHUB_TOKEN`; no Marketplace credentials are used. Marketplace
publication is a separate maintainer operation and is not performed by these workflows.

## Upstream refreshes

**Update EEex API data** resolves upstream once, generates without write credentials, and passes
JSON data to a separate publisher job. The resulting PR includes source counts and run evidence.
GitHub can require approval before workflows run on a PR created by `GITHUB_TOKEN`; use the PR's
**Approve workflows to run** control and wait for all checks. Generation success alone is not
full PR validation.
