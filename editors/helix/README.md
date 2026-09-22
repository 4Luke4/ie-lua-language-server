# Helix

Helix has a built-in LSP client; no plugin is needed. Read [../README.md](../README.md) first for the
Node.js and install-path requirements shared by every editor.

## 1. Merge the configuration

Copy the entries from `languages.toml` in this directory into your user file:

| Platform      | Path                              |
| ------------- | --------------------------------- |
| Linux, macOS  | `~/.config/helix/languages.toml`  |
| Windows       | `%APPDATA%\helix\languages.toml`  |

A project-local `.helix/languages.toml` works the same way and keeps the server scoped to one
project, which is usually what you want.

Replace `/absolute/path/to/ie-lua-language-server` in `args` with your install directory.

## 2. Check it

Open a `.lua` file and run `:lsp-workspace-command`, or just check the statusline. `hx --health lua`
confirms which language servers Helix has resolved for Lua.

## How the two file types are routed

- **`.lua`** reuses Helix's built-in Lua language and only adds `ie-lua` to its `language-servers`.
  Helix sends the id `lua`, which this server treats as IE Lua. The entry deliberately does not set
  `language-id`, because that would change the id for every Lua server you have configured.
- **`.menu`** gets its own `[[language]]` entry with `language-id = "ie-menu"`, which is the id the
  server's embedded-Lua analysis depends on. There is no tree-sitter grammar for `.menu`, so Helix
  will not syntax-highlight it; diagnostics, completion, hover and the rest still work, because
  those come from the server.

If you already use another Lua language server, list both in `language-servers`. Helix queries them
in order and merges the results.

## Notes

- Settings use the same `ieLua.*` keys as the Visual Studio Code extension and live under
  `[language-server.ie-lua.config]`. Helix delivers that table as the LSP initialization options,
  which this server accepts as a settings source.
- Go to Definition on an API symbol resolves to an upstream documentation URL rather than a file, so
  Helix cannot jump to it. The same URL appears in the hover.
- `:log-open` shows the client log if the server does not start; the usual cause is `node` not being
  on `PATH` for the environment Helix was launched from.
