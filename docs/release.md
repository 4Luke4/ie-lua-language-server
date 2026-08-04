# Release and Prerelease Publishing

The `Package` and `Release` GitHub Actions workflows are initiated only through their manual dispatch forms. `Package` performs a dry-run build and retains the audited VSIX as a workflow artifact. `Release` runs the same validation and packaging sequence, publishes that exact VSIX to the official Visual Studio Marketplace, and then publishes it on the GitHub release page.

## One-Time Repository Setup

The repository currently publishes with an Azure DevOps personal access token stored as the repository Actions secret `VSCE_PAT`. Use the following setup so the token is tied to an account that can publish for `infinity-engine-tools` and has no unrelated Azure DevOps scopes.

1. Open the [Visual Studio Marketplace publisher management page](https://marketplace.visualstudio.com/manage/publishers/) and sign in with the Microsoft or Microsoft Entra account that will own the token.
2. Select `infinity-engine-tools`. Confirm that the account can manage or publish extensions for that publisher. If the publisher is not visible, ask one of its owners to add this account before continuing.
3. Open the [Azure DevOps portal](https://dev.azure.com/), select an accessible organization, open the user-settings menu beside the profile image, and select **Personal access tokens**.
4. Select **New Token** and configure it as follows:
   - **Name**: a purpose-specific name such as `ie-lua-language-server GitHub Actions`.
   - **Organization**: **All accessible organizations**. The Visual Studio Marketplace currently requires this global scope for PAT publishing.
   - **Expiration**: the shortest practical lifetime permitted by policy. Record the expiration date for rotation.
   - **Scopes**: **Custom defined** -> **Show all scopes** -> **Marketplace** -> **Manage**. Do not enable unrelated scopes.
5. Select **Create** and copy the token immediately; Azure DevOps does not display it again.
6. Verify the token from a trusted local checkout before storing it. After `npm ci`, run the commands below and paste the token only at the hidden prompt:

   ```bash
   read -rsp 'VSCE_PAT: ' IE_LUA_VSCE_PAT
   echo
   VSCE_PAT="$IE_LUA_VSCE_PAT" npx --no-install vsce verify-pat infinity-engine-tools
   unset IE_LUA_VSCE_PAT
   ```

   Continue only when `vsce` confirms that the token has publish rights for `infinity-engine-tools`.

7. Open the repository's **Settings** -> **Secrets and variables** -> **Actions** -> **Secrets** -> **New repository secret**.
8. Enter `VSCE_PAT` as the exact secret name, paste the verified token as its value, and select **Add secret**. Never place the token in a workflow file, local environment file, issue, pull request, or Actions log.
9. Confirm that `VSCE_PAT` appears in the repository secrets list. GitHub will not show its stored value. On every release, the workflow verifies the token's Marketplace publish rights before creating a draft GitHub release.

Global Azure DevOps PATs are scheduled for retirement on December 1, 2026. This PAT flow therefore requires migration to Microsoft Entra ID secure automated publishing before that date; do not extend a global token past the retirement deadline.

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
4. Rejects an existing tag or GitHub release and verifies that `VSCE_PAT` has publish rights for the configured Marketplace publisher.
5. Creates a draft GitHub release targeting the exact commit selected when the workflow was dispatched.
6. Publishes the audited VSIX to the Visual Studio Marketplace, using the Marketplace prerelease flag when selected.
7. Publishes the GitHub release only after Marketplace publication succeeds. Stable releases are marked as the latest release; prereleases are marked accordingly.

If Marketplace publication fails, the GitHub release remains a draft and is not presented as a completed release. Inspect the failure and the Marketplace state before deciding whether to remove the draft/tag and retry.

## Upstream References

- Visual Studio Code Marketplace prereleases use `vsce package --pre-release` and `vsce publish --pre-release`, and automated publication reads the token from `VSCE_PAT`: `https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions`
- Visual Studio Code Marketplace PAT publishing requires **All accessible organizations** and **Marketplace: Manage**; global PATs retire on December 1, 2026: `https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token`
- Azure DevOps PATs are created from user settings, are shown only once, and should use minimal scopes and short lifetimes: `https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate`
- GitHub manual workflows use `workflow_dispatch` inputs: `https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch`
- GitHub releases can include binary assets and can remain drafts until they are ready to publish: `https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository`
- GitHub CLI creates releases and uploads assets with `gh release create`: `https://cli.github.com/manual/gh_release_create`
