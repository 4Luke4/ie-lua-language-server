;;; ie-lua-eglot.el --- Eglot setup for the IE Lua language server  -*- lexical-binding: t; -*-

;; Load this file from your init file after replacing the install path below:
;;
;;   (load "/absolute/path/to/ie-lua-language-server/editors/emacs/ie-lua-eglot.el")
;;
;; See README.md in this directory for the lsp-mode variant.

;;; Code:

(defgroup ie-lua nil
  "Infinity Engine Lua language server."
  :group 'tools)

(defcustom ie-lua-server-directory "/absolute/path/to/ie-lua-language-server"
  "Directory holding dist/server/server.js and resources/api/api-index.json."
  :type 'directory
  :group 'ie-lua)

(defun ie-lua-server-command ()
  "Return the stdio invocation of the bundled language server."
  (list "node"
        (expand-file-name "dist/server/server.js" ie-lua-server-directory)
        "--stdio"))

;; The server reads .menu files as a host language with embedded Lua regions. Emacs has no mode for
;; them, so derive one from prog-mode: it exists only to give the buffers a mode Eglot can key on.
(define-derived-mode ie-menu-mode prog-mode "IE Menu"
  "Major mode for Infinity Engine .menu files."
  (setq-local comment-start "// ")
  (setq-local comment-end ""))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.menu\\'" . ie-menu-mode))

(with-eval-after-load 'eglot
  ;; Eglot derives the LSP language id from the major mode unless the entry names one. Both ids are
  ;; stated explicitly here, because the server's embedded-Lua handling depends on "ie-menu" and a
  ;; mode-derived guess would not produce it.
  (add-to-list 'eglot-server-programs
               `(((lua-mode :language-id "ie-lua")
                  (lua-ts-mode :language-id "ie-lua")
                  (ie-menu-mode :language-id "ie-menu"))
                 . ,(lambda (&rest _) (ie-lua-server-command))))

  ;; Settings use the same ieLua.* keys as the Visual Studio Code extension. Eglot answers the
  ;; server's workspace/configuration requests from this plist.
  (setq-default eglot-workspace-configuration
                '(:ieLua (:validation (:mode "save" :debounceMs 300)))))

(provide 'ie-lua-eglot)
;;; ie-lua-eglot.el ends here
