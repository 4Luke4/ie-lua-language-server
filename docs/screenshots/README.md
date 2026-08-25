# Screenshot Capture Recipe

The README screenshots are captured from the packaged extension in a real Visual Studio Code Extension Development Host.

1. Use a temporary user-data directory and extensions directory.
2. Create that profile's `User/settings.json` with:

   ```json
   {
     "workbench.colorTheme": "Monokai",
     "window.zoomLevel": 0
   }
   ```

3. Build the extension with Node.js 24 using `npm ci --no-audit --progress=false` and `npm run bundle`.
4. Launch VS Code with `--extensionDevelopmentPath` pointing at this checkout, the temporary profile directories, and a non-proprietary fixture workspace.
5. Confirm that `workbench.colorTheme` resolves to exactly `Monokai` before capture; do not substitute a similarly named third-party theme.
6. Set the window to 1440x900. Capture PNG images for EEex function completion, EEex hover documentation, EEex signature help, annotation-aware x64 structure member completion, embedded `.menu` diagnostics, and document symbols.
7. Save the six images as `completion.png`, `hover.png`, `signature-help.png`, `structures.png`, `menu-diagnostics.png`, and `symbols.png` in this directory.

Use generated EEex metadata for completion, hover, and signature-help fixtures. The x64 fixture must use a type annotation and complete members of the resolved structure instead of exposing fields globally. Wait for each expected language-server result before opening its Visual Studio Code UI and capturing the image.

All fixtures must be purpose-built, non-proprietary snippets. Do not use game-distributed Lua or menu files.
