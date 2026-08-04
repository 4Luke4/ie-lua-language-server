# Security Policy

## Supported Versions

Only the latest released version is supported with security updates.

## Reporting a Vulnerability

Report suspected vulnerabilities privately through the project maintainers. Do not disclose security issues in public issues or pull requests until a fix is available.

Include:

- Affected version.
- Reproduction steps.
- Impact assessment.
- Any relevant logs or sample files.

## Handling

Maintainers triage reports, confirm impact, prepare a fix, and publish a security release when warranted.

## Automated CodeQL Issue Tracking

The `Track CodeQL findings` workflow runs only after `CodeQL` succeeds for a push or manual scan of the default branch. It uses the repository-scoped `GITHUB_TOKEN` with only `security-events: read` and `issues: write` permissions; it does not use an OpenAI API key, personal access token, or checked-out repository code.

When open CodeQL alerts exist, the workflow creates or updates one issue authored by `github-actions[bot]`. The issue summarizes every open finding, links to the authoritative Code scanning alert, and applies `security`, `codeql`, and a `severity: <level>` label reflecting the highest current CodeQL severity. It preserves unrelated labels, reopens the issue when findings recur, and closes it when a later successful scan has no open findings.

No repository secret or pull-request permission setting is required. The workflow does not dismiss alerts or change source code. Maintainers remain responsible for validating findings, preparing fixes, and confirming CI and CodeQL results.

Because this repository is public, the generated tracking issue is also public. Do not add exploit instructions, secrets, or confidential reproduction material to it; use private vulnerability reporting for sensitive details.

Dependabot remains responsible only for dependency version and vulnerability updates. It does not remediate CodeQL source-code findings.
