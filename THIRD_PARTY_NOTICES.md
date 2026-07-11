# Third-Party Notices

This project uses third-party packages and generated reference data. Runtime package licenses must be reviewed before publishing.

## Runtime Dependencies

- `luaparse`: MIT license.
- `vscode-languageclient`: MIT license.
- `vscode-languageserver`: MIT license.
- `vscode-languageserver-textdocument`: MIT license.
- `vscode-uri`: MIT license.

## Documentation Sources

Generated API/help data must record source URLs, source commits or versions, and license status.

- Lua 5.2 Reference Manual: Copyright 2011-2013 Lua.org, PUC-Rio. Freely available under the Lua license.
- LuaJIT documentation: Copyright 2005-2026 Mike Pall. Released under the MIT open source license as stated by the official LuaJIT documentation site.

EEex documentation text is permission-gated. The generator may index symbol names and provenance, but the extension must not bundle EEex prose until permission or compatible licensing is recorded here.

Local game files under `samples/` are ignored and must not be bundled. Utility-function metadata from local samples may only be generated through an explicit local opt-in.
