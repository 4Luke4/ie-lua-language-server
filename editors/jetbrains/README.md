# JetBrains IDEs

Uses [LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij), a free, open-source LSP client that
works in every IntelliJ-based IDE and edition. Read [../README.md](../README.md) first for the
Node.js and install-path requirements shared by every editor.

## Why LSP4IJ rather than the platform LSP API

JetBrains has its own LSP client API, and since the 2026.2 cycle its client API is open source.
Using it still means writing and building an IDE plugin, because it is an API for plugin developers,
not a configuration surface. LSP4IJ exposes the same capability as a _user-defined language server_
you configure in the IDE, which is why this repository ships an LSP4IJ template instead of a plugin.

## 1. Install LSP4IJ

**Settings → Plugins → Marketplace → LSP4IJ**, then restart the IDE.

## 2. Import the template

`lsp4ij-template/` in this directory is an LSP4IJ template directory (`template.json`,
`settings.json`, `initializationOptions.json`).

1. Open the **LSP Console** tool window.
2. Use **New Language Server**, then **Import from custom template…**, and select the
   `lsp4ij-template` directory.
3. On the **Server** tab, replace `/absolute/path/to/ie-lua-language-server` in the command with your
   install directory. Keep `--stdio` as the last argument. LSP4IJ also accepts the `$PROJECT_DIR$`,
   `$WORKSPACE_DIR$` and `$USER_HOME$` macros if you would rather keep the command portable.
4. Apply.

The template registers two mappings, so the server receives the language ids it defines:

| Pattern  | Language id |
| -------- | ----------- |
| `*.lua`  | `ie-lua`    |
| `*.menu` | `ie-menu`   |

## 3. Configure it by hand instead

If you would rather not import a directory, create the server manually with **New Language Server**:

- **Server → Command**: `node /absolute/path/to/ie-lua-language-server/dist/server/server.js --stdio`
- **Mappings → File name patterns**: `*.lua` with language id `ie-lua`, and `*.menu` with language
  id `ie-menu`
- **Configuration**: the contents of `lsp4ij-template/settings.json`

## 4. Check it

Open a `.lua` file from an Infinity Engine project. The LSP Console shows the `initialize` exchange,
and the server appears as running. Completion, hover and signature help work in the editor; the
console's **Server Initialize Responses** view shows the capabilities the server advertised.

## Notes

- Settings use the same `ieLua.*` keys as the Visual Studio Code extension and go in the
  **Configuration** tab.
- A `.menu` file has no IntelliJ file type by default, so the mapping above is what makes the IDE
  send its contents at all. If your IDE already associates `.menu` with another file type, map by
  file type instead of by pattern on the **Mappings** tab.
- Go to Definition on an API symbol resolves to an upstream documentation URL rather than a file, so
  the IDE will not navigate to it. The same URL appears in the hover documentation as a link.
