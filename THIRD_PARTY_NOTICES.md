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
- EE Game Lua Functions and EEex Functions documentation: Copyright the EEex-Docs authors and contributors. Source: `https://github.com/Bubb13/EEex-Docs`, pinned to the commit recorded in `resources/api/api-index.json`. The extension bundles function help text with source URLs and line-level provenance.

EE Game Structures (x64) narrative documentation remains permission-gated. The extension bundles generated structure names and factual layout metadata, but not that narrative prose.

Local game files under `samples/` are ignored and must not be bundled. Utility-function metadata from local samples may only be generated through an explicit local opt-in.
