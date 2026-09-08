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

The latest versioned changelog entry may use `Unreleased` during preparation and link to its PR.
Historical comparisons follow adjacent recorded milestones, using existing tags or immutable
commits; preparation dates do not imply publication. Before publication, commit a real date in
`YYYY-MM-DD` format and a repository comparison link ending in the exact requested tag. Prerelease
links include the tag suffix even though the entry and package versions remain numeric. The new
tag need not exist yet: the publication workflow creates it after verification.

## Verification and publication

1. Prepare changes on a branch and open a draft PR. Inspect CI, CodeQL, dependency review, and
   commit-policy results for its final revision. Download maintenance artifacts to review/apply
   formatting, lockfile, or generated-data changes; rerun Actions after applying them.
2. Follow `release/READINESS.md`. Verify installed VSIX results across the supported runner/editor
   matrix and record any unavailable coverage explicitly.
3. Run **Actions → Release → Run workflow**, choose the branch, release type, matching tag, and
   leave **dry_run** enabled. This validates prerequisites and runs the shared complete suite,
   without creating a tag or release. An `Unreleased` entry produces a preparation warning and
   does not establish publication readiness. A dated entry must have a valid final comparison link
   even during a dry run.
4. When scheduling publication, commit the intended release date and final comparison link. Rerun
   all required PR checks and the Release dry run on this finalized revision; record the new SHA
   and run links. The workflow never assigns a date or edits the changelog automatically.
5. Merge the verified PR. Run Release on that merged default-branch commit with **dry_run** disabled
   only when publication is intended. Publication checks the merged PR's validation and publishes
   the exact artifact produced by that run. A failed upload leaves a draft for maintainer inspection;
   the workflow does not overwrite or delete a previous release.

Release validation rejects publication with an unreleased, missing, duplicated, or mismatched
latest changelog entry or link, an invalid date, or a comparison targeting a different release tag.
The workflow passes its `dry_run` input explicitly; direct `release:check` invocation defaults to
publication checks when `DRY_RUN` is omitted and rejects values other than `true` or `false`.

Publication uses the repository `GITHUB_TOKEN`; no Marketplace credentials are used. Marketplace
publication is a separate maintainer operation and is not performed by these workflows.

## Upstream refreshes

**Update EEex API data** resolves upstream once, generates without write credentials, and passes
JSON data to a separate publisher job. The resulting PR includes source counts and run evidence.
GitHub can require approval before workflows run on a PR created by `GITHUB_TOKEN`; use the PR's
**Approve workflows to run** control and wait for all checks. Generation success alone is not
full PR validation.
