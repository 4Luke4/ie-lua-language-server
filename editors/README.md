# Editor integrations

Every editor here runs the same bundled language server that the Visual Studio Code extension runs,
over stdin/stdout instead of IPC. There is one server, one API index, and one set of behaviours; only
the client configuration differs.

## Support matrix

| Editor            | Client                    | Ships a config file | Guide                                    |
| ----------------- | ------------------------- | ------------------- | ---------------------------------------- |
| Visual Studio Code | built in (this extension) | n/a                 | [main README](../README.md)              |
| Sublime Text      | LSP package               | yes                 | [sublime](sublime/README.md)             |
| Neovim            | built-in `vim.lsp`        | yes                 | [neovim](neovim/README.md)               |
| Emacs             | Eglot                     | yes                 | [emacs](emacs/README.md)                 |
| JetBrains IDEs    | LSP4IJ                    | yes                 | [jetbrains](jetbrains/README.md)         |
| Helix             | built in                  | yes                 | [helix](helix/README.md)                 |
| Kate              | LSP Client plugin         | yes                 | [kate](kate/README.md)                   |
| Geany             | LSP Client plugin         | yes                 | [geany](geany/README.md)                 |
| Zed               | extension required        | **no**              | [zed](zed/README.md)                     |
| Notepad++         | third-party plugin        | **no**              | [notepadpp](notepadpp/README.md)         |

Zed and Notepad++ have no configuration-only path to a custom language server. Their guides describe
what each actually requires rather than offering a configuration that would not work.

## Requirements

- **Node.js 24** on `PATH`. The server is a Node program; these editors start it as a subprocess.
- **A built server**: either this repository after `npm run bundle`, or an unpacked `.vsix` from the
  Marketplace or a GitHub release. Both give the same layout:

  ```
  <install>/dist/server/server.js
  <install>/resources/api/api-index.json
  ```

Every configuration in this directory contains `/absolute/path/to/ie-lua-language-server`. Replace it
with your `<install>` directory. Relative paths are not reliable, because each editor chooses its own
working directory for the subprocess.

## The two language ids

The server distinguishes documents by language id: `ie-menu` for `.menu` files and `ie-lua` for
everything else. Editors configured by hand often send their own id, so the server also recognises a
`.menu` file by its extension. Sending `ie-lua` and `ie-menu` explicitly is still preferred, because
it is the only signal an editor can give for a `.menu` buffer that has not been saved yet.

## The API index

The server looks for its API data in this order:

1. `IE_LUA_API_INDEX`, if set, as a full path to `api-index.json`.
2. `resources/api/api-index.json` relative to the working directory.
3. `resources/api/api-index.json` relative to the server bundle, which is `<install>` for an intact
   install.

Step 3 covers a normal install, so none of the configurations here set the environment variable. Set
it if you relocate `dist/` away from `resources/`. If the index cannot be read, the lexical services
still work against an empty API index rather than failing to start.

## What you get

All twelve language services are the same ones the Visual Studio Code extension provides, and CI
verifies each of them against this stdio transport on Linux, Windows and macOS: completion, hover,
signature help, go to definition, find references, same-file rename, diagnostics, formatting,
document symbols, workspace symbols, semantic tokens, and folding.

Two behaviours differ from Visual Studio Code and are properties of the server, not of any editor:

- **Go to definition on an API symbol** answers with the upstream documentation URL
  (`https://github.com/Bubb13/EEex-Docs/blob/<commit>/…#L<line>`), not a file location. Editors that
  can open a URL will open it; others will report that the location cannot be opened. The same URL is
  always present in the symbol's hover, which is the portable way to reach it.
- **Workspace symbols and workspace validation cover open documents**, not the whole project tree.

Settings use the same `ieLua.*` keys as the extension and are documented in the
[main README](../README.md). Editors that support `workspace/configuration` can send them; the rest
fall back to the documented defaults.

## Validating a change to these files

`npm run policy:check` asserts that every editor in `manifest.json` has a guide, that every shipped
configuration exists, launches the server with `--stdio`, and declares both language ids, and that no
directory here is missing from the manifest. Run it through GitHub Actions, never locally.
