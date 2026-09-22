# Emacs

Primary setup uses [Eglot](https://www.gnu.org/software/emacs/manual/html_node/eglot/), which ships
with Emacs 29 and later. An `lsp-mode` variant is below. Read [../README.md](../README.md) first for
the Node.js and install-path requirements shared by every editor.

## Eglot

1. Copy `ie-lua-eglot.el` somewhere on your machine, or load it straight from this checkout.
2. Set `ie-lua-server-directory` to your install directory, either by editing the `defcustom` default
   or from your init file.
3. Load it:

```elisp
(load "/absolute/path/to/ie-lua-language-server/editors/emacs/ie-lua-eglot.el")
(setq ie-lua-server-directory "/absolute/path/to/ie-lua-language-server")
```

4. Open a `.lua` or `.menu` file and run `M-x eglot`. Add `(add-hook 'lua-mode-hook #'eglot-ensure)`
   and `(add-hook 'ie-menu-mode-hook #'eglot-ensure)` to connect automatically.

The file registers an entry in `eglot-server-programs` whose major-mode part uses the
`(MODE :language-id ID)` form, so Emacs sends `ie-lua` and `ie-menu` rather than a mode-derived
guess. It also defines a minimal `ie-menu-mode` derived from `prog-mode` and maps `.menu` to it,
because Emacs has no mode for that format and Eglot keys on major modes.

`lua-mode` is not bundled with Emacs; install it from MELPA, or use the built-in `lua-ts-mode` on
Emacs 30 and later. The entry covers both.

## lsp-mode

If you already use `lsp-mode`, register the same server without loading the Eglot file:

```elisp
(with-eval-after-load 'lsp-mode
  (add-to-list 'lsp-language-id-configuration '(lua-mode . "ie-lua"))
  (add-to-list 'lsp-language-id-configuration '(ie-menu-mode . "ie-menu"))
  (lsp-register-client
   (make-lsp-client
    :new-connection (lsp-stdio-connection
                     (list "node"
                           "/absolute/path/to/ie-lua-language-server/dist/server/server.js"
                           "--stdio"))
    :major-modes '(lua-mode ie-menu-mode)
    :server-id 'ie-lua)))
```

You still need an `ie-menu-mode` and the `auto-mode-alist` entry; the `define-derived-mode` and
`add-to-list` forms in `ie-lua-eglot.el` can be copied as they are.

## Notes

- Settings use the same `ieLua.*` keys as the Visual Studio Code extension. Under Eglot they go in
  `eglot-workspace-configuration` as a plist, as shown in the shipped file.
- Go to Definition on an API symbol resolves to an upstream documentation URL rather than a file, so
  Emacs will report that it cannot visit it. The same URL appears in the hover, where
  `M-x browse-url-at-point` opens it.
- `M-x eglot-events-buffer` shows the protocol traffic, including the `initialize` response, if a
  connection does not behave as expected.
