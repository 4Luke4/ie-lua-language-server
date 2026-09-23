# Architecture and trust boundaries

The VS Code client starts a bundled Node language server over IPC. Every other supported editor
runs the same bundle over stdio. Document contents, settings, and configured API manifests are inputs;
the server parses Lua and embedded menu text but does not execute game scripts. Its formatter
performs targeted whitespace deletions outside strings/comments without invoking workspace executables.
Analysis captures immutable document text, session identity, version, and configuration/API generation;
closed or superseded work cannot publish diagnostics or repopulate the current analysis cache.

API manifests resolve shards relative to their directory and reject lexical path escapes. This
is not a filesystem sandbox against symlinks or a malicious local owner. Invalid candidate
manifests are skipped after runtime shape validation. Startup uses an empty API index if no candidate
loads; failed reloads retain the last good index. Replacement is atomic, and errors report candidate
paths without logging JSON excerpts or document contents. Markdown is
returned as documentation, without enabling trusted command links. The VS Code client lets hovers
render inline HTML so the `<br/>`, `<sup>`, `<u>`, and `<pre>` tags in upstream documentation
display; VS Code still sanitizes that HTML against its own allowlist, and command links stay off.

Documentation ingestion reads pinned upstream text and converts it to generated metadata and
Markdown. It never runs upstream build scripts. Source identity, category counts, source lines,
and generated-file integrity are audited. Local game samples are excluded from releases. In
Actions, the upstream inputs are third-party checkouts at pinned commits and one release archive
accepted only on a SHA-256 match; they are fetched with persisted credentials removed, read as data
under `.cache/`, and never executed. Checkout reads refuse symbolic links and verify the pinned
commit from the checkout's own HEAD before any file is parsed.

Dependencies execute during installation/building in disposable GitHub-hosted runners. PR
verification has read-only repository access and no publication credentials. Label and merge
automation uses trusted base configuration without checking out PR code. Publication and branch
creation have narrowly scoped write jobs; generated artifact contents are not shell commands.
Caches hold downloaded dependencies, exact editor distributions, and versioned actionlint binaries.
They contain no editor profiles or publication credentials. Verification rebuilds and tests source
on every run; publication never executes PR-produced cache contents in a privileged job.

CodeQL and dependency review remain independent gates. Release publication consumes verified
artifacts from its own run and targets its selected commit. Its prerequisite validation rejects
publication until the latest changelog entry matches VERSION, has a real calendar date, and links
to a repository comparison ending in the selected tag. Only an explicit dry run may accept an
unreleased entry, with a preparation warning. Existing tags/releases are never replaced. Secrets,
local profiles, and raw environment dumps must not enter artifacts.

Residual limits: this is not a sandbox for a compromised editor or local filesystem. Stdio tests
cover the server contract every non-VS Code editor uses, not those editors' GUI interactions.
Shipped client configurations in `editors/` are inert data: they are validated structurally and
never executed by this repository. Hosted-runner matrices cover their reported OS and architecture,
not every operating-system release or CPU architecture.
