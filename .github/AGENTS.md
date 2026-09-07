# Automation instructions

- Run verification in read-only jobs without secrets. Pin external actions to full commit SHAs.
- Privileged jobs must use trusted base-branch configuration, never execute pull-request code,
  and expose credentials only to the operation that needs them.
- Keep `Verify` as the stable aggregate check. Missing, failed, cancelled, or unexpectedly skipped
  prerequisites must fail it. Do not path-filter required workflows.
- CI and Release share verification. Publish only the audited artifact from the selected commit.
- Maintain label definitions in `labels.json` and test labeler key coverage. Preserve other labels.
- Keep CodeQL action revisions identical and grouped in Dependabot. Patch auto-merge must await
  every required workflow for the current head and use a head-match guard.
- Use environment variables for event/input values and files for multiline PR bodies.
- Generated-data PRs can require GitHub workflow approval; report pending coverage explicitly.
