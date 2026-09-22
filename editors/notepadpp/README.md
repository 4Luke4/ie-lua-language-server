# Notepad++

**Notepad++ ships no Language Server Protocol client**, so this directory documents the actual
situation rather than shipping a configuration that nothing would read.

## Why

LSP support in Notepad++ has only ever existed as third-party plugins. There is no first-party
client, and none of the available plugins is maintained by the Notepad++ project. The two that exist
are community efforts at differing levels of completeness:

- [`NppLSP`](https://github.com/dail8859/NppLSP)
- `NppLspClient`

This project does not maintain, endorse, or test against either. Their coverage of the protocol is
partial, so even where one connects, the twelve language services this server provides will not all
be available.

If you use one of them, the server is started the same way as everywhere else:

```
node /absolute/path/to/ie-lua-language-server/dist/server/server.js --stdio
```

Configure `.lua` to send the language id `ie-lua` and `.menu` to send `ie-menu` if the plugin allows
it. If it does not, `.menu` files still work: the server recognises them by file extension.

## Recommended alternative

If you want full support on Windows without changing habits much, any of the editors in
[../README.md](../README.md) with a shipped configuration will work — Visual Studio Code, Sublime
Text, Kate and the JetBrains IDEs all run natively on Windows, and the server itself is the same in
every case.

## What works without a language server

Notepad++'s built-in Lua lexer still highlights `.lua` files, and you can add `menu` to its
associated extensions under **Settings → Style Configurator → Lua → User ext.**. That gives you
highlighting only — no diagnostics, completion, hover, or API data.

## If this changes

If Notepad++ gains a first-party LSP client, or a third-party plugin reaches the point of being
dependable, please open an issue. A tested configuration would be added here.
