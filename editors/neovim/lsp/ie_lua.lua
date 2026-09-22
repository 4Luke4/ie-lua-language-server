-- Neovim configuration for the IE Lua language server.
--
-- Drop this file at `lsp/ie_lua.lua` on your 'runtimepath' (usually
-- `~/.config/nvim/lsp/ie_lua.lua`), replace the install path below, and enable it with
-- `vim.lsp.enable('ie_lua')`. See README.md in this directory for the `.menu` filetype rule.
--
-- One client serves both filetypes: the server distinguishes documents by language id, not by
-- connection, so a second client would only duplicate the process and its API index.
return {
  cmd = {
    'node',
    '/absolute/path/to/ie-lua-language-server/dist/server/server.js',
    '--stdio',
  },

  filetypes = { 'lua', 'iemenu' },

  -- Neovim defaults the language id to the buffer's filetype, which would send 'iemenu' and lose
  -- every embedded-Lua behaviour. These are the two ids the server actually defines.
  get_language_id = function(_, filetype)
    return filetype == 'iemenu' and 'ie-menu' or 'ie-lua'
  end,

  root_markers = { '.git' },

  -- Workspace symbols and workspace validation cover open documents, so a resolved project root is
  -- convenient but not required for the server to be useful.
  workspace_required = false,

  settings = {
    ieLua = {
      validation = {
        mode = 'save',
        debounceMs = 300,
      },
    },
  },
}
