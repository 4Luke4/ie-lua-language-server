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

## Automated CodeQL Remediation

The `Codex CodeQL remediation` workflow runs only after the `CodeQL` workflow succeeds for a push to the default branch. It reads the branch's open CodeQL alerts with `security-events: read`, gives Codex a minimized alert record and a read-only repository token, and serializes any proposed changes as a patch artifact. A separate job with no OpenAI credential applies that patch and opens a pull request.

The workflow never runs against pull-request code, dismisses CodeQL alerts, merges its own changes, or grants a repository write token to Codex. Maintainers must review the generated patch and approve CI and CodeQL checks before merging it.

Repository setup requires:

1. An Actions secret named `OPENAI_API_KEY` containing an API key authorized to use Codex.
2. **Settings** -> **Actions** -> **General** -> **Workflow permissions** -> **Allow GitHub Actions to create and approve pull requests** enabled so the isolated publication job can open the remediation pull request.

Pull-request workflows created with the repository `GITHUB_TOKEN` may wait for a maintainer to approve their first run. This is an intentional GitHub security boundary, not a reason to bypass review with a broader personal access token.

Dependabot remains responsible only for dependency version and vulnerability updates. It does not remediate CodeQL source-code findings.
