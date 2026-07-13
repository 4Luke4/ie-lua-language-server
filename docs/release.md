# Release and Prerelease Publishing

This project builds a VSIX in GitLab CI. Marketplace publication is currently handled manually from the Visual Studio Marketplace publisher page.

## Versioning Rules

- Keep `package.json.version` in `major.minor.patch` form. Visual Studio Marketplace prereleases do not support SemVer suffixes such as `-alpha.1`.
- Use odd minor versions for Marketplace prereleases and even minor versions for stable releases. Example: `0.1.0` prerelease, then `0.2.0` stable.
- Git tags may include a prerelease suffix for GitLab process clarity. The CI prerelease jobs match tags like `v0.1.0-pre.1`, `v0.1.0-alpha.1`, `v0.1.0-beta.1`, `v0.1.0-rc.1`, or `v0.1.0-preview.1`.
- Keep README and CHANGELOG images Marketplace-safe. Use PNG/JPEG assets rather than user-provided SVG screenshots.

## Local Prerelease Checklist

1. Update `package.json.version`, `package-lock.json`, and `CHANGELOG.md`.
2. Run the full local verification:

   ```sh
   npm ci
   npm run verify
   npm run package:pre-release
   npm run package:audit
   ```

3. Install the generated VSIX in VS Code and smoke-test `.lua` and `.menu` files.
4. Commit the version, lockfile, changelog, and any generated resource changes.
5. Create and push an annotated prerelease tag:

   ```sh
   git tag -a v0.1.0-pre.1 -m "IE Lua Language Server v0.1.0 pre.1"
   git push origin main
   git push origin v0.1.0-pre.1
   ```

## GitLab Prerelease

The prerelease tag pipeline exposes these active jobs:

- `package_prerelease_vsix`: automatically builds `vsce package --pre-release` and keeps a hidden, short-lived VSIX artifact for the release job.
- `gitlab_prerelease`: manually uploads that VSIX to the GitLab Generic Package Registry and creates the GitLab prerelease entry with a single VSIX release asset link.

The `publish_marketplace` and `publish_marketplace_prerelease` CI jobs are intentionally commented out until automated Marketplace publishing is enabled again.

Recommended GitLab flow:

1. Push a prerelease tag that matches the CI pattern.
2. Open the tag pipeline.
3. Wait for `package_prerelease_vsix` to finish.
4. Run `gitlab_prerelease` to create the GitLab prerelease entry and VSIX release asset.
5. Download the VSIX from the GitLab prerelease asset and test it if it was not already tested locally.
6. Upload the same VSIX manually through the Visual Studio Marketplace publisher management page.

Manual GitLab UI alternative:

1. Go to **Deploy** -> **Releases** -> **New release**.
2. Select the prerelease tag or create it from the desired commit.
3. Use a title like `IE Lua Language Server v0.1.0-pre.1`.
4. Prefer the CI `gitlab_prerelease` job so the release asset points at the GitLab package registry. If creating the release by hand, first publish the VSIX somewhere durable and link only that VSIX file.

## Manual Marketplace Prerelease

Build the prerelease VSIX locally or download it from the GitLab prerelease asset:

```sh
npm ci
npm run package:pre-release
```

Then open `https://marketplace.visualstudio.com/manage/publishers/`, choose the `infinity-engine-tools` publisher, and upload the generated `ie-lua-language-server-<package.json.version>.vsix` file manually. The package filename uses `package.json.version`, not the Git prerelease tag suffix.

## Stable Release

Stable releases use plain tags such as `v0.2.0`.

```sh
npm ci
npm run verify
npm run package
npm run package:audit
git tag -a v0.2.0 -m "IE Lua Language Server v0.2.0"
git push origin main
git push origin v0.2.0
```

The stable tag pipeline exposes these active jobs:

- `package_vsix`: automatically builds a stable VSIX and keeps a hidden, short-lived VSIX artifact for the release job.
- `gitlab_release`: manually uploads that VSIX to the GitLab Generic Package Registry and creates the GitLab release entry with a single VSIX release asset link.

Recommended stable GitLab flow:

1. Push a stable tag that matches the CI pattern.
2. Open the tag pipeline.
3. Wait for `package_vsix` to finish.
4. Run `gitlab_release` to create the GitLab release entry and VSIX release asset.
5. Download the VSIX from the GitLab release asset and test it if it was not already tested locally.
6. Upload the same VSIX manually through the Marketplace publisher management page.

## Upstream References

- Visual Studio Code Marketplace prereleases use `vsce package --pre-release` or `vsce publish --pre-release`, and Marketplace extension versions must remain `major.minor.patch`: `https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions`
- GitLab releases can be created from the Releases page or by a CI/CD job using the `release` keyword: `https://docs.gitlab.com/user/project/releases/`
- GitLab Generic Package Registry uploads are used for release VSIX assets: `https://docs.gitlab.com/user/packages/generic_packages/`
