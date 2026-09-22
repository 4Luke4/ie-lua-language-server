# Sublime Text

Uses the [LSP](https://lsp.sublimetext.io/) package. Read [../README.md](../README.md) first for the
Node.js and install-path requirements shared by every editor.

## 1. Install the LSP package

Package Control → **Install Package** → **LSP**. No `LSP-*` helper package is needed; this server is
configured directly.

## 2. Install the `.menu` syntax

Copy `IE Menu.sublime-syntax` into your `Packages/User/` directory, which
**Preferences → Browse Packages…** opens. Sublime picks it up immediately and applies it to `.menu`
files.

This syntax exists for one structural reason. The LSP package has no per-server `languageId` setting:
it derives the language id from the view's base scope, falling back to the scope's second component
when the scope is not in its built-in table. Giving `.menu` files the base scope `source.ie-menu`
therefore makes Sublime send exactly `ie-menu`, which is the id the server needs to analyse embedded
Lua. `.lua` files keep Sublime's built-in Lua syntax and send `lua`, which the server treats as IE
Lua.

## 3. Add the server configuration

**Preferences → Package Settings → LSP → Server Configurations** opens
`Packages/User/LanguageServers.sublime-settings`. Copy both entries from
`LanguageServers.sublime-settings` in this directory into it and replace
`/absolute/path/to/ie-lua-language-server` with your install directory.

On Windows, write the path with forward slashes or escaped backslashes, since the file is JSON:

```jsonc
"command": ["node", "C:/Tools/ie-lua-language-server/dist/server/server.js", "--stdio"]
```

## 4. Check it

Open a `.lua` file from an Infinity Engine project. **LSP: Toggle Log Panel** from the Command
Palette shows the handshake. Typing `Infinity_` should offer API completions, and hovering a known
symbol should show its documentation with a `Source:` link to the pinned upstream page.

## Notes

- `selector` is what binds a server to a buffer. If you use a different Lua syntax package, check its
  base scope with **Tools → Developer → Show Scope Name** and adjust `selector` to match.
- Settings go in the `settings.ieLua` object of each entry and use the same keys as the Visual Studio
  Code extension.
- Go to Definition on an API symbol resolves to an upstream documentation URL rather than a file.
  Sublime will report that it cannot open it; use the `Source:` link in the hover instead.
