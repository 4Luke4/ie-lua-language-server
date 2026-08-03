# Release and Prerelease Publishing

GitHub Actions builds each tagged VSIX and creates a draft GitHub release. Marketplace publication remains a manual step on the Visual Studio Marketplace publisher page.

## Versioning Rules

- Keep `package.json.version` in `major.minor.patch` form. Visual Studio Marketplace prereleases do not support SemVer suffixes such as `-alpha.1`.
- Use odd minor versions for Marketplace prereleases and even minor versions for stable releases. Example: `0.1.0` prerelease, then `0.2.0` stable.
- Prerelease Git tags must use `v<major>.<minor>.<patch>-<channel>.<number>`, where `<channel>` is `alpha`, `beta`, `rc`, `pre`, or `preview`.
- Stable Git tags must use `v<major>.<minor>.<patch>`.
- The numeric version in the Git tag must exactly match `package.json.version`; the release workflow rejects mismatches.
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

For a test build without creating a tag, run the `Package` workflow from the GitHub Actions page and select `prerelease` or `stable`. It retains the VSIX workflow artifact for seven days.

## GitHub Prerelease

Pushing a supported prerelease tag starts the `Release` workflow. The workflow:

1. Confirms that the tag is a supported prerelease tag and matches `package.json.version`.
2. Runs `npm ci`, `npm run verify`, `npm run package:pre-release`, and `npm run package:audit`.
3. Creates a draft GitHub prerelease with a single `ie-lua-language-server-<tag>.vsix` asset.

Open the repository's **Releases** page, inspect the draft, download and smoke-test its VSIX, then publish the prerelease when it is ready. Upload that same VSIX manually through the Visual Studio Marketplace publisher management page.

## Manual Marketplace Prerelease

Build the prerelease VSIX locally or download it from the draft GitHub prerelease:

```sh
npm ci
npm run package:pre-release
```

Then open `https://marketplace.visualstudio.com/manage/publishers/`, choose the `infinity-engine-tools` publisher, and upload the generated `ie-lua-language-server-<package.json.version>.vsix` file manually. The local package filename uses `package.json.version`, not the Git prerelease tag suffix.

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

Pushing a supported stable tag starts the `Release` workflow. It verifies the tag against `package.json.version`, runs the full verification and stable packaging commands, and creates a draft GitHub release with a single `ie-lua-language-server-<tag>.vsix` asset.

Open the repository's **Releases** page, inspect the draft, download and smoke-test its VSIX, then publish the release when it is ready. Upload that same VSIX manually through the Visual Studio Marketplace publisher management page.

## Upstream References

- Visual Studio Code Marketplace prereleases use `vsce package --pre-release` or `vsce publish --pre-release`, and Marketplace extension versions must remain `major.minor.patch`: `https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions`
- GitHub releases can include binary assets and can remain drafts until they are ready to publish: `https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository`
- GitHub CLI creates releases and uploads assets with `gh release create`: `https://cli.github.com/manual/gh_release_create`
