# Implementation instructions

- Follow the root architecture boundaries and retain public settings and LSP capabilities.
- Use `node:test` and assertions for unit and stdio tests; editor-host tests use the installed VSIX.
  Run every executable check through GitHub Actions, including fixture updates and formatting.
- Test behavior at its boundary: source offsets, protocol requests, command ownership, lifecycle,
  documentation rendering, and actual archive contents. Use synthetic fixtures, not game samples.
- Retain parser fallback behavior and legacy API manifests. Keep document-close cancellation and
  subprocess cleanup explicit. Add comments only for non-obvious compatibility/lifecycle decisions.
- Generated resources belong to the ingestion pipeline; do not manually manufacture upstream prose.
