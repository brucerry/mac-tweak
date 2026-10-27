# Terminal components

Choose `prompt`, `aliases`, or `colors` individually, or use `--preset terminal`.
They configure zsh on macOS; they do not change the user's default shell.

| Component | Effect |
| --- | --- |
| prompt | Sets `PROMPT` to a bold colored user@host, current directory, and privilege-aware prompt character. User, host, and directory are zsh expansions, with formatting reset before command input. |
| aliases | Defines `ls='ls -G'` and `ll='ls -al'`. The ls alias requests macOS color output using the current palette. |
| colors | Sets `CLICOLOR=1` and `LSCOLORS=ExGxFxdxCxDxDxabagacadah`, choosing the published file-type palette independently of the aliases. |
| local-bin-path | Prepends and deduplicates `$HOME/.local/bin`. Tool selections automatically include this dependency. It enables no terminal styling. |

The prompt uses color 81 for the user, 183 for @host, 222 for the directory,
and 114 for the prompt character, with bold text. A terminal supporting 256
colors displays the intended palette.

## Loading and existing customization

Setup copies selected snippets into `~/.config/mac-tweak/`; it never sources
them from the repository checkout. You can move or remove the checkout after
installation. The managed block in `.zshrc` loads `init.zsh`, which loads the
environment and previously selected interactive snippets. For tool paths, a
managed `.zprofile` block also loads `env.zsh` in login shells.

New integration blocks are appended after existing startup-file text. Selected
PROMPT, alias names, and color variables therefore take precedence over earlier
definitions. The preview names those overrides and shows the file differences.
Original text outside the block remains intact, including later user edits.
Reapplication keeps one block and does not duplicate the path entry.

Selecting only aliases on a later run leaves an earlier managed prompt enabled.
Selecting only a tool on a fresh account adds path integration without prompt,
aliases, or colors. An unselected, unmanaged file using a reserved snippet name
blocks shared loader installation so setup cannot silently enable it.

Setup uses home-based `.zshrc` and `.zprofile` files. A different `ZDOTDIR`,
symlinked edit target, malformed or duplicate markers, or edited managed content
requires user resolution. Configuration is syntax-checked before activation.
To customize further without a conflict, keep personal startup text outside the
managed block. Edits to a managed snippet are preserved and reported as drift.

## Apply and recover

```sh
./tweak.sh plan --with prompt,aliases
./tweak.sh apply --with prompt,aliases
./tweak.sh verify --with prompt,aliases
```

`apply` displays a fresh plan and asks for approval. Open a new terminal after
application. Existing edited files are backed up with their original permissions
under the printed run directory. New paths are recorded separately. See
[recovery](recovery.md) to restore a file or remove a newly created file after
checking for later edits. Setup has no automatic uninstall command.

## Terminal app profiles

The Terminal app group includes app preferences and a separate Terminal profiles card. The profile card installs `Mac Tweak Dark.terminal` and `Mac Tweak Light.terminal` under `~/.config/mac-tweak/profiles/`. They contain Bruce's portable colors, font, opacity, blur, cursor, dimensions and title settings, with `shellExitAction=1` so shell exit closes that profile's window. Startup commands, working directories, accounts, bookmarks and window/session state are excluded. Existing Terminal profiles are not overwritten or silently made default.

After Apply, use Utilities to open the desired profile. Set it as Default in Terminal Settings if wanted. The App close behavior card adds ordinary Terminal quit after the final window closes; other Terminal windows, dialogs and minimized sessions prevent that quit. The original three shell components remain independent and keep using the established zsh loader.

[Apple documents Terminal profile shell exit options](https://support.apple.com/en-lamr/guide/terminal/trmlshll/mac).
