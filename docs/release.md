# Release and Prerelease Publishing

The `Release` GitHub Actions workflow is initiated only through its manual dispatch form. It validates and packages the selected release type, then publishes that exact VSIX on the GitHub release page.

The workflow does not publish to the Visual Studio Marketplace and does not require Marketplace credentials. The automatically provided `GITHUB_TOKEN` creates the tag and GitHub release; no separate GitHub secret is required.

## Versioning Rules

- Keep every workspace `package.json` and `package-lock.json` version in `major.minor.patch` form. Visual Studio Marketplace prereleases do not support SemVer suffixes in the extension version.
- Use odd minor versions for Marketplace prereleases and even minor versions for stable releases. Example: `0.3.1` is a prerelease version and `0.4.0` is a stable version.
- Prerelease Git tags must use `v<major>.<minor>.<patch>-<channel>.<number>`, where `<channel>` is `alpha`, `beta`, `rc`, `pre`, or `preview`.
- Stable Git tags must use `v<major>.<minor>.<patch>`.
- The numeric version in the Git tag must exactly match the root `package.json` version. The release workflow rejects mismatched versions, mismatched release types, and incorrect odd/even release channels.
- Release tags must be new. The release workflow rejects an existing tag or GitHub release instead of replacing it.
- Keep README and CHANGELOG images Marketplace-safe. Use PNG/JPEG assets rather than user-provided SVG screenshots.

## Verification Before Release

1. Update all workspace versions, `package-lock.json`, and `CHANGELOG.md`.
2. Run the full local verification:

   ```sh
   npm ci
   npm run verify
   ```

3. Build the intended package with `npm run package:pre-release` or `npm run package`.
4. Smoke-test the generated VSIX with `.lua` and `.menu` files in Visual Studio Code.

## GitHub Publishing

1. Merge the verified release commit to the branch that should receive the tag, normally `main`.
2. Open **Actions** -> **Release** -> **Run workflow**.
3. Select the branch containing the release commit.
4. Select `prerelease` or `stable`.
5. Enter a matching tag name, such as `v0.3.1-pre.1` for a prerelease or `v0.4.0` for a stable release.
6. Run the workflow.

The workflow:

1. Validates the selected release type, tag syntax, odd/even channel policy, and root package version.
2. Runs `npm ci`, the full verification suite, the matching VSIX packaging command, and the package audit.
3. Renames and uploads exactly one `ie-lua-language-server-<tag>.vsix` artifact.
4. Rejects an existing tag or GitHub release.
5. Publishes a GitHub release targeting the exact commit selected when the workflow was dispatched. Stable releases are marked as the latest release; prereleases are marked accordingly.

Marketplace publication, if needed, must be performed separately from these workflows.

## Upstream References

- Visual Studio Code Marketplace prereleases use `vsce package --pre-release`: `https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions`
- GitHub manual workflows use `workflow_dispatch` inputs: `https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch`
- GitHub releases can include binary assets: `https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository`
- GitHub CLI creates releases and uploads assets with `gh release create`: `https://cli.github.com/manual/gh_release_create`
