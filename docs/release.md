# Release and Prerelease Publishing

This project publishes a VSIX to GitLab and, when approved, to the Visual Studio Marketplace.

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

The prerelease tag pipeline exposes these jobs:

- `package_prerelease_vsix`: automatically builds `vsce package --pre-release` and keeps the VSIX as a short-lived artifact.
- `gitlab_prerelease`: creates a GitLab release entry for the prerelease tag.
- `publish_marketplace_prerelease`: publishes the prerelease VSIX to the Visual Studio Marketplace.

Recommended GitLab flow:

1. Push a prerelease tag that matches the CI pattern.
2. Open the tag pipeline.
3. Wait for `package_prerelease_vsix` to finish.
4. Download and test the VSIX artifact if it was not already tested locally.
5. Run `gitlab_prerelease`.
6. If Marketplace publication is approved, run `publish_marketplace_prerelease`.

Manual GitLab UI alternative:

1. Go to **Deploy** -> **Releases** -> **New release**.
2. Select the prerelease tag or create it from the desired commit.
3. Use a title like `IE Lua Language Server v0.1.0-pre.1`.
4. Paste the changelog notes and attach or link the VSIX artifact from `package_prerelease_vsix`.

## Marketplace Prerelease

CI publishing requires a protected, masked `VSCE_PAT` variable with Marketplace publish permission.

Local publishing is also possible:

```sh
npm ci
npm run package:pre-release
npx vsce publish --pre-release --packagePath ./ie-lua-language-server-0.1.0.vsix --pat "$VSCE_PAT"
```

The package filename uses `package.json.version`, not the Git prerelease tag suffix. Adjust the example path for the current version.

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

The stable tag pipeline can run `package_vsix`, then the protected manual `publish_marketplace` job.

## Upstream References

- Visual Studio Code Marketplace prereleases use `vsce package --pre-release` or `vsce publish --pre-release`, and Marketplace extension versions must remain `major.minor.patch`: `https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions`
- GitLab releases can be created from the Releases page or by a CI/CD job using the `release` keyword: `https://docs.gitlab.com/user/project/releases/`
