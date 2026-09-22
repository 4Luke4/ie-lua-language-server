# Geany

Uses the **LSP Client** plugin, part of [geany-plugins](https://plugins.geany.org/lsp.html) since
Geany 2.0. Read [../README.md](../README.md) first for the Node.js and install-path requirements
shared by every editor.

## 1. Enable the plugin

Install `geany-plugins` (packaged as `geany-plugin-lsp` on several distributions), then
**Tools → Plugin Manager → LSP Client**.

## 2. Add the configuration

**Tools → LSP Client → User Configuration** opens your copy of the plugin configuration, seeded from
the global one. Merge the `[all]` and `[Lua]` sections from `lsp.conf` in this directory into it and
replace `/absolute/path/to/ie-lua-language-server` with your install directory.

Servers restart automatically when the configuration file changes, so there is nothing else to do.

## 3. Make `.menu` files reach the server

`lang_id_mappings` in the `[Lua]` section already maps `*.menu` to the `ie-menu` language id, so a
single server process serves both. For Geany to open `.menu` files with the Lua filetype in the first
place, add the extension to the Lua line in **Tools → Configuration Files →
filetype_extensions.conf**:

```ini
Lua=*.lua;*.menu;
```

Highlighting will follow Geany's Lua rules, which is wrong for the host syntax around the embedded
Lua but harmless. Everything the language server provides — diagnostics, completion, hover, symbols —
is correct, because the server is told the real language id through `lang_id_mappings`.

## 4. Check it

Open a `.lua` file from an Infinity Engine project. **Tools → LSP Client → Server Initialize
Responses** shows the capabilities the server advertised once it is running; if it is empty, the
server has not started.

## Notes

- Settings use the same `ieLua.*` keys as the Visual Studio Code extension and go in
  `initialization_options`, which the plugin sends at startup and this server accepts as a settings
  source. `initialization_options_file` can point at a JSON file instead.
- `use_without_project` and `use_outside_project_dir` are enabled because Infinity Engine trees are
  often edited without a Geany project; drop them if you would rather scope the server to projects.
- Go to Definition on an API symbol resolves to an upstream documentation URL rather than a file, so
  Geany cannot navigate to it. The same URL appears in the hover.
- `rpc_log=stdout` and `show_server_stderr=true` in the `[Lua]` section are useful when diagnosing a
  server that will not start.
