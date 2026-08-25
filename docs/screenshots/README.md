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
5. Set the window to 1440x900. Capture PNG images for function completion, function hover, embedded `.menu` diagnostics, and document symbols.
6. Save the four images as `completion.png`, `hover.png`, `menu-diagnostics.png`, and `symbols.png` in this directory.

The completion and hover fixtures should exercise generated EE/EEex function metadata, including parameters and official help text. Do not use game-distributed Lua or menu files as fixtures.
