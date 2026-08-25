# IE Lua Language Server

[![CI](https://github.com/4Luke4/ie-lua-language-server/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/4Luke4/ie-lua-language-server/actions/workflows/ci.yml)
[![CodeQL](https://github.com/4Luke4/ie-lua-language-server/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/4Luke4/ie-lua-language-server/actions/workflows/codeql.yml)
[![Visual Studio Marketplace](https://img.shields.io/badge/VS%20Marketplace-Install-0078D4)](https://marketplace.visualstudio.com/items?itemName=infinity-engine-tools.ie-lua-language-server)
[![Latest release](https://img.shields.io/github/v/release/4Luke4/ie-lua-language-server?display_name=tag&sort=semver)](https://github.com/4Luke4/ie-lua-language-server/releases/latest)
[![Total release downloads](https://img.shields.io/github/downloads/4Luke4/ie-lua-language-server/total)](https://github.com/4Luke4/ie-lua-language-server/releases)
[![Latest release downloads](https://img.shields.io/github/downloads/4Luke4/ie-lua-language-server/latest/total)](https://github.com/4Luke4/ie-lua-language-server/releases/latest)

Professional language support for Enhanced Edition Infinity Engine Lua and `.menu` files.

This repository ships:

- A Visual Studio Code extension.
- A stdio-capable Language Server Protocol server for editors such as Kate.

This extension targets:

- Lua 5.2 with the base globals and the `bit32`, `debug`, `math`, `string`, and `table` libraries.
- LuaJIT compatibility mode.
- Infinity Engine `.lua` files.
- Infinity Engine `.menu` files with embedded Lua regions.

## Features

- Completion, hover, signature help, go to definition, find references, same-file rename, diagnostics, formatting, document symbols, workspace symbols, semantic tokens, and folding.
- Scope-aware Lua analysis backed by a parser plus tolerant fallback scanning for incomplete buffers.
- Embedded Lua analysis in `.menu` files for backtick chunks, `lua "..."` expressions, action/open/close/escape blocks, and `enabled`/`clickable` expressions.
- Source-driven API data from official sources only, with immutable upstream provenance.
- Full EE Game Lua and EEex function completion, hover, signature help, and source definitions, including namespace members, colon methods, typed instance aliases, parameter defaults, return values, warnings, notes, examples, and tables.
- Full EE Game Structures (x64) layout metadata: structure and field completion, annotation-aware member resolution, chained field hover, exact source definitions, types, offsets, and byte sizes.

## Screenshots

The screenshots below were captured at 1440x900 from a real Visual Studio Code Extension Development Host using non-proprietary fixture snippets and Visual Studio Code's built-in **Monokai** theme. The reproducible capture steps are documented in [`docs/screenshots/README.md`](docs/screenshots/README.md).

<details>
<summary><strong>View Visual Studio Code screenshots</strong></summary>

### Completion

![Visual Studio Code completion suggestions](docs/screenshots/completion.png)

### Hover

![Visual Studio Code hover information](docs/screenshots/hover.png)

### Embedded `.menu` Diagnostics

![Visual Studio Code embedded menu diagnostics](docs/screenshots/menu-diagnostics.png)

### Document Symbols

![Visual Studio Code document symbols](docs/screenshots/symbols.png)

</details>

## Runtime Dependencies

Visual Studio Code users do **not** need to install `luaparse`, Node.js, npm, or any other npm package to use validation. The published Marketplace extension and generated VSIX bundle the language server runtime dependencies.

Kate users do not need `luaparse` or npm packages, but they do need Node.js 24 LTS available on `PATH` because Kate starts the bundled server as an external stdio process.

## Using with Visual Studio Code

For Windows, macOS, and Linux:

1. Install **IE Lua Language Server** from the Visual Studio Code Marketplace, or install the generated `.vsix`.
2. Reload Visual Studio Code if prompted.
3. Open an Infinity Engine `.lua` or `.menu` file.

Settings can be changed from the Visual Studio Code Settings UI or `settings.json`:

```json
{
  "ieLua.dialect": "lua52",
  "ieLua.validation.mode": "save",
  "ieLua.validation.debounceMs": 300,
  "ieLua.diagnostics.unknownGlobals": "off"
}
```

The extension activates automatically for `.lua` and `.menu` files and exposes the commands listed below.

## Using with Kate

Kate integration uses the same bundled LSP server over stdin/stdout. This is useful when you want completion, hover, diagnostics, definitions, references, symbols, and formatting outside Visual Studio Code.

Requirements:

- Kate with the **LSP Client** plugin enabled.
- Node.js 24 LTS on `PATH`.
- A built checkout or unpacked VSIX containing `dist/server/server.js` and `resources/api/api-index.json`.

Build from source:

```sh
npm install
npm run bundle
```

Install the optional `.menu` syntax definition so Kate can map `*.menu` files to the `ie-menu` LSP language id:

```sh
install -D editors/kate/syntax/ie-menu.xml ~/.local/share/org.kde.syntax-highlighting/syntax/ie-menu.xml
```

For Flatpak, Snap, Windows, or custom KDE paths, use the syntax-definition directory reported by Kate/KDE. KDE documents the generic user location as `org.kde.syntax-highlighting/syntax/` under a `qtpaths --paths GenericDataLocation` directory, and the Windows user location as `%USERPROFILE%\AppData\Local\org.kde.syntax-highlighting\syntax`.

Then open **Settings** -> **Configure Kate** -> **Plugins**, enable **LSP Client**, and add this to **LSP Client** -> **User Server Settings**. Replace `/absolute/path/to/ie-lua-language-server` with this checkout or unpacked VSIX extension directory:

```json
{
  "servers": {
    "ie-lua": {
      "command": [
        "node",
        "/absolute/path/to/ie-lua-language-server/dist/server/server.js",
        "--stdio"
      ],
      "rootIndicationFileNames": [".git"],
      "url": "https://github.com/4Luke4/ie-lua-language-server",
      "highlightingModeRegex": "^Lua$",
      "settings": {
        "ieLua": {
          "validation": {
            "mode": "save",
            "debounceMs": 300
          }
        }
      }
    },
    "ie-menu": {
      "command": [
        "node",
        "/absolute/path/to/ie-lua-language-server/dist/server/server.js",
        "--stdio"
      ],
      "rootIndicationFileNames": [".git"],
      "url": "https://github.com/4Luke4/ie-lua-language-server",
      "highlightingModeRegex": "^IE Menu$",
      "settings": {
        "ieLua": {
          "validation": {
            "mode": "save",
            "debounceMs": 300
          }
        }
      }
    }
  }
}
```

The same JSON is available as `editors/kate/lsp-client.example.json`.

Kate's LSP Client plugin communicates with configured servers over stdin/stdout and uses `highlightingModeRegex` to map Kate highlighting modes to server entries. See the official Kate LSP Client documentation: `https://docs.kde.org/stable5/en/kate/kate/kate-application-plugin-lspclient.html`.

Node.js and npm are only required when building/testing this repository or when launching the stdio server from a non-VS Code editor.

## Validation Modes

`ieLua.validation.mode` controls when diagnostics run:

- `manual`: only through `IE Lua: Validate Document` or `IE Lua: Validate Workspace`.
- `save`: on save. This is the default.
- `type`: while editing, using the configured debounce delay.
- `saveAndType`: on save and while editing, using the configured debounce delay for edits.

`ieLua.validation.debounceMs` controls the type-validation delay in milliseconds and defaults to `300`. Lower values make diagnostics appear sooner but may increase CPU usage during rapid edits. Higher values coalesce more edits and reduce repeated validation work, but diagnostics take longer to appear.

## Commands

- `IE Lua: Validate Document`
- `IE Lua: Validate Workspace`
- `IE Lua: Reload API Data`
- `IE Lua: Show API Source`
- `IE Lua: Open Server Log`

## Development

Node.js 24 LTS and npm are required. This repository is structured as a TypeScript npm workspace.

```sh
npm install
npm run compile
npm test
npm run package
```

The language server runs as a separate process over IPC from the VS Code extension client.

Generate API metadata with:

```sh
npm run compile
npm run ingest:docs
```

The docs-ingestion step fetches official Lua 5.2, LuaJIT, EE Game Lua Function, and EEex Function documentation at build time and stores the source wording as Markdown for hover, completion, and signature-help previews. RST presentation is converted to equivalent VS Code Markdown while paragraphs, emphasis, lists, tables, admonitions, links, code blocks, and visible punctuation are retained.

Generated API data is split by source section for auditability. `resources/api/api-index.json` is only a manifest; symbols live in these six files:

- `resources/api/sections/ee-game-lua-functions.json`
- `resources/api/sections/eeex-functions.json`
- `resources/api/sections/ee-game-structures-x64.json`
- `resources/api/sections/lua52.json`
- `resources/api/sections/luajit.json`
- `resources/api/sections/ee-utility-functions.json`

Set `IE_LUA_FETCH_EEEX=1` when running `npm run ingest:docs` to refresh EEex metadata. The generator resolves the latest `dev` revision by default; set `IE_LUA_EEEX_COMMIT` to a full commit SHA for a reproducible run. Function ingestion discovers every non-index EE Game function page and every `EEex_*` function anchor from the pinned tree, rejects incomplete or malformed input, and records exact commit-and-line provenance. Structure layouts include names, fields, types, offsets, byte sizes, and pinned source lines; EE Game Structures narrative prose remains permission-gated and is not bundled.

The scheduled **Update EEex API data** workflow checks the upstream repository daily. When its revision changes, the workflow regenerates and verifies the API data on a dedicated branch and opens a pull request for review; it never executes upstream code.

Local game files under `samples/` are ignored because they may contain proprietary official content. Set `IE_LUA_SCAN_LOCAL_UTIL=1` only when you intentionally want a local docs-ingestion run to derive EE Utility Function metadata from an untracked `samples/util.lua` file.

## Release Process

Stable and prerelease publishing instructions are maintained in `docs/release.md`.

Use `npm run package` for a stable VSIX and `npm run package:pre-release` for a Marketplace prerelease VSIX. The prerelease path uses VS Code's `--pre-release` flag; do not put a SemVer prerelease suffix in `package.json.version`.

## Documentation Provenance

The shipped API index is generated from these official sources:

- EE Game Lua Functions: `https://github.com/Bubb13/EEex-Docs/tree/b4d0acd776f5d3b8337afbd038d6128efce51cfd/source/EE%20Game%20Lua%20Functions`
- EEex Functions: `https://github.com/Bubb13/EEex-Docs/tree/b4d0acd776f5d3b8337afbd038d6128efce51cfd/source/EEex%20Functions`
- EE Game Structures (x64): `https://github.com/Bubb13/EEex-Docs/tree/b4d0acd776f5d3b8337afbd038d6128efce51cfd/source/EE%20Game%20Structures%20(x64)`
- Lua 5.2: `https://www.lua.org/manual/5.2/`
- LuaJIT: `https://luajit.org/`
- EE Utility Functions: local, untracked `samples/util.lua` only when explicitly enabled for docs ingestion.

Bundled third-party documentation attribution is recorded in `THIRD_PARTY_NOTICES.md`.

## License

This project is proprietary software. See `LICENSE.md`.
