# Zed

**No configuration file can enable this server in Zed today.** This directory documents what Zed
actually requires, rather than shipping a `settings.json` fragment that would not work.

## Why

Zed does not accept an arbitrary language-server command from user settings. A language server is
registered by a Zed **extension**, which is a compiled artifact:

- `extension.toml` declaring the extension and a `[language_servers.<id>]` entry naming the
  languages it serves.
- A `languages/<Language>/config.toml` for each language the extension defines, with the grammar,
  file suffixes and related metadata.
- Rust source implementing the `Extension` trait, in particular `language_server_command`, which
  returns the executable, its arguments and its environment. It is compiled to WebAssembly.

`settings.json` can configure a language server an extension has already registered — its binary
path, initialization options, and which servers a language uses — but it cannot introduce one.

## What that means here

Shipping a Zed extension would add a Rust toolchain and a `wasm32` target to this repository's build
and release pipeline for a single editor, and the resulting artifact could not be verified by the
existing suite. That is a deliberate scope decision, not an oversight.

## If you want it anyway

The shape of a third-party extension that wraps this server is small:

```toml
# extension.toml
id = "ie-lua"
name = "IE Lua"
version = "0.1.0"
schema_version = 1

[language_servers.ie-lua]
name = "IE Lua Language Server"
languages = ["IE Lua", "IE Menu"]
```

`language_server_command` returns:

```rust
zed::Command {
    command: "node".into(),
    args: vec![
        "/absolute/path/to/ie-lua-language-server/dist/server/server.js".into(),
        "--stdio".into(),
    ],
    env: Default::default(),
}
```

with `languages/IE Lua/config.toml` and `languages/IE Menu/config.toml` declaring
`file_types = ["lua"]` and `file_types = ["menu"]`. Zed can install an unpacked extension directory
as a dev extension, so it does not have to be published to be used.

Note that Zed derives the LSP language id from the language name. The server treats any id other
than `ie-menu` as IE Lua, and separately recognises a `.menu` file by its extension, so a dev
extension will behave correctly even if the id does not match exactly.

Please open an issue if you build one — a working extension is the thing that would change this
decision.

## Meanwhile

Zed's built-in Lua support and any general-purpose Lua language server still work on Infinity Engine
`.lua` files. What you lose is the EE Game Lua, EEex and x64 structure API data, and all `.menu`
handling.
