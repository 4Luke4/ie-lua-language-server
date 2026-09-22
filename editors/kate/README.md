# Kate

Uses the **LSP Client** plugin bundled with Kate. Read [../README.md](../README.md) first for the
Node.js and install-path requirements shared by every editor.

## 1. Install the `.menu` syntax definition

`syntax/ie-menu.xml` gives `.menu` files a Kate highlighting mode named **IE Menu**, which is what the
server configuration matches on.

```sh
install -D editors/kate/syntax/ie-menu.xml \
  ~/.local/share/org.kde.syntax-highlighting/syntax/ie-menu.xml
```

For Flatpak, Snap, Windows or a custom KDE prefix, use the syntax-definition directory Kate reports.
KDE documents the generic user location as `org.kde.syntax-highlighting/syntax/` beneath a directory
from `qtpaths --paths GenericDataLocation`, and the Windows user location as
`%USERPROFILE%\AppData\Local\org.kde.syntax-highlighting\syntax`.

## 2. Enable the plugin and add the server

**Settings → Configure Kate → Plugins**, enable **LSP Client**. Then in **LSP Client → User Server
Settings**, paste the contents of `lsp-client.example.json` from this directory and replace
`/absolute/path/to/ie-lua-language-server` with your install directory.

The two entries are selected by `highlightingModeRegex`: `^Lua$` for `.lua` files and `^IE Menu$` for
`.menu` files, which is the mode the syntax definition above installs.

## 3. Check it

Open a `.lua` file from an Infinity Engine project. The **LSP Client** tool view shows the server
state and its log.

## Notes

- Kate's LSP Client communicates over stdin/stdout, which is the same transport every other editor
  here uses; the `--stdio` argument must stay last in `command`.
- Settings use the same `ieLua.*` keys as the Visual Studio Code extension and go in the `settings`
  object of each entry.
- Go to Definition on an API symbol resolves to an upstream documentation URL rather than a file, so
  Kate cannot open it as a document. The same URL appears in the hover.
- Official plugin documentation:
  `https://docs.kde.org/stable5/en/kate/kate/kate-application-plugin-lspclient.html`
