# Neovim

Uses Neovim's built-in LSP client (`vim.lsp.config` / `vim.lsp.enable`), no plugin required. Read
[../README.md](../README.md) first for the Node.js and install-path requirements shared by every
editor.

## 1. Install the config

Copy `lsp/ie_lua.lua` to `lsp/ie_lua.lua` on your `runtimepath`:

```
~/.config/nvim/lsp/ie_lua.lua
```

Edit the `cmd` path to point at your install directory. Neovim merges every `lsp/<name>.lua` on the
`runtimepath` for that name, so you can override parts of it from `init.lua` with
`vim.lsp.config('ie_lua', { … })` instead of editing the file.

## 2. Give `.menu` files a filetype

Neovim has no filetype for `.menu`, and the config attaches by filetype. In `init.lua`:

```lua
vim.filetype.add({ extension = { menu = 'iemenu' } })
```

The name `iemenu` is arbitrary and local to your configuration — the config file's
`get_language_id` translates it into the `ie-menu` language id the server actually defines. If you
pick a different filetype name, change it in both places.

## 3. Enable it

```lua
vim.lsp.enable('ie_lua')
```

`:checkhealth vim.lsp` lists it under **Enabled Configurations**, and `:LspInfo` (or
`:checkhealth vim.lsp` again) shows the attached client once you open a matching buffer.

## Narrowing which Lua files attach

The shipped config attaches to every `lua` buffer, which includes your own Neovim configuration. If
that is not what you want, restrict it to real Infinity Engine projects with a marker file. Create an
empty `.ie-lua` file at each project root and override the config in `init.lua`:

```lua
vim.lsp.config('ie_lua', {
  root_markers = { '.ie-lua' },
  workspace_required = true,
})
```

With `workspace_required = true`, the client attaches only where that marker resolves a root.

## Notes

- One client serves both filetypes. The server separates documents by language id, so a second
  client would only start a second process with its own copy of the API index.
- `settings.ieLua` in the config file uses the same keys as the Visual Studio Code extension, and
  Neovim answers the server's `workspace/configuration` requests from it.
- Go to Definition on an API symbol resolves to an upstream documentation URL rather than a file, so
  Neovim will report that it cannot open the location. The same URL is in the hover, where `gx` over
  it opens your browser.
