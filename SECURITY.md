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

## Verification boundaries

CodeQL and dependency review are required security checks. Review findings in GitHub Code scanning
and report sensitive details privately. See `docs/architecture/THREAT_MODEL.md` for trust boundaries
and `docs/release/READINESS.md` for release gates. Dependabot updates dependencies; source-code
findings require maintainer investigation and verified fixes.
