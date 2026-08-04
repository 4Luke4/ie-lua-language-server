# Release and Prerelease Publishing

The `Package` and `Release` GitHub Actions workflows are initiated only through their manual dispatch forms. `Package` performs a dry-run build and retains the audited VSIX as a workflow artifact. `Release` runs the same validation and packaging sequence, publishes that exact VSIX to the official Visual Studio Marketplace, and then publishes it on the GitHub release page.

## One-Time Repository Setup

Create a repository Actions secret named `VSCE_PAT` containing an Azure DevOps personal access token authorized to publish extensions for the `infinity-engine-tools` Marketplace publisher. The release workflow checks that the secret is available before it creates a tag or draft release.

The automatically provided `GITHUB_TOKEN` creates the tag and GitHub release; no separate GitHub secret is required.

## Versioning Rules

- Keep every workspace `package.json` and `package-lock.json` version in `major.minor.patch` form. Visual Studio Marketplace prereleases do not support SemVer suffixes in the extension version.
- Use odd minor versions for Marketplace prereleases and even minor versions for stable releases. Example: `0.3.1` is a prerelease version and `0.4.0` is a stable version.
- Prerelease Git tags must use `v<major>.<minor>.<patch>-<channel>.<number>`, where `<channel>` is `alpha`, `beta`, `rc`, `pre`, or `preview`.
- Stable Git tags must use `v<major>.<minor>.<patch>`.
- The numeric version in the Git tag must exactly match the root `package.json` version. The packaging workflow rejects mismatched versions, mismatched release types, and incorrect odd/even release channels.
- Release tags must be new. The release workflow rejects an existing tag or GitHub release instead of replacing it.
- Keep README and CHANGELOG images Marketplace-safe. Use PNG/JPEG assets rather than user-provided SVG screenshots.

## Verification Before Release

1. Update all workspace versions, `package-lock.json`, and `CHANGELOG.md`.
2. Run the full local verification:

   ```sh
   npm ci
   npm run verify
   ```

3. Run the `Package` workflow from the GitHub Actions page against the commit intended for release.
4. Select `prerelease` or `stable` and enter the intended tag name.
5. Download the retained VSIX artifact and smoke-test `.lua` and `.menu` files in Visual Studio Code.

The `Package` workflow does not create a tag or publish externally. Its artifact is retained for seven days.

## Publishing

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
4. Rejects an existing tag or GitHub release and verifies that `VSCE_PAT` is configured.
5. Creates a draft GitHub release targeting the exact commit selected when the workflow was dispatched.
6. Publishes the audited VSIX to the Visual Studio Marketplace, using the Marketplace prerelease flag when selected.
7. Publishes the GitHub release only after Marketplace publication succeeds. Stable releases are marked as the latest release; prereleases are marked accordingly.

If Marketplace publication fails, the GitHub release remains a draft and is not presented as a completed release. Inspect the failure and the Marketplace state before deciding whether to remove the draft/tag and retry.

## Upstream References

- Visual Studio Code Marketplace prereleases use `vsce package --pre-release` and `vsce publish --pre-release`, and automated publication reads the token from `VSCE_PAT`: `https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions`
- GitHub manual workflows use `workflow_dispatch` inputs: `https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch`
- GitHub releases can include binary assets and can remain drafts until they are ready to publish: `https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository`
- GitHub CLI creates releases and uploads assets with `gh release create`: `https://cli.github.com/manual/gh_release_create`
