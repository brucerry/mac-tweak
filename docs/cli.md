# Advanced command-line reference

Most users can use the graphical chooser. This reference covers scripting and advanced terminal operation.

Adopt individual developer tools and terminal preferences, or select the full
published setup. The first release covers Node/npm, uv, GitHub CLI, tig, and
independent zsh prompt, alias, and color components. Applications, macOS system
preferences, accounts, and credentials are outside this release.

## Get the repository

With Git installed (Apple Command Line Tools provides it):

```sh
git clone https://github.com/brucerry/mac-tweak.git
cd mac-tweak
```

You can also download and extract the repository's ZIP from GitHub. Starting
setup requires only macOS's Bash and system utilities, not Homebrew, Node, Python,
or a dotfile manager. Git and Command Line Tools are needed to build tig.

Supported hosts are macOS 13+ on Apple Silicon and Intel; the pinned Node release
requires macOS 13.5+. Terminal components use regular, home-based zsh startup
files. See [validation coverage](validation.md) for native results and gaps.

## Discover and choose

```sh
./tweak.sh list
./tweak.sh info aliases
./tweak.sh plan --with prompt,aliases
./tweak.sh plan --preset full --without tig,prompt
./tweak.sh plan --preset terminal --with gh
```

`terminal` selects prompt, aliases, and colors. `development` selects Node/npm,
uv, GitHub CLI, and tig. `system` selects the native macOS settings groups. `terminal-app` selects Terminal app preferences and portable profiles; `behaviors` selects the three custom helper groups. `full` selects every public choice, so its review can include settings, helper builds and login files. Tools also select the
disclosed `local-bin-path` dependency so a fresh zsh session can find them.

Run `./tweak.sh --terminal` in a terminal for the optional numbered selector. The default `./tweak.sh` opens the graphical chooser. You can choose component
IDs, numbers separated by commas, or a preset. `q` cancels. Explicit `--with`
and `--without` lists are repeatable; exclusions cannot remove a required
dependency. Selection is additive: selecting fewer components on a later run
does not uninstall earlier choices or change unrelated software.

Review a plan before applying. Planning and discovery do not download tools or
write setup files. A run never assumes `full` when no selection is provided.

## Apply selected parts

For example, adopt the terminal preset and GitHub CLI:

```sh
./tweak.sh plan --preset terminal --with gh
./tweak.sh apply --preset terminal --with gh
./tweak.sh verify --preset terminal --with gh
```

Each `apply` computes a fresh plan, shows differences and dependencies, and asks
for approval. Cancelling changes nothing. Missing prerequisites and conflicts
block the whole selection before application. A failed later action reports
completed, failed, and unattempted work and keeps recovery information.

To adopt every published component:

```sh
./tweak.sh plan --preset full
./tweak.sh apply --preset full
./tweak.sh verify --preset full
```

Tig needs Command Line Tools installed separately. Exclude it with `--without
tig` if you want to start without a source build. Working compatible external
tools are reused; incompatible external installations are left for you to
update through their existing manager or remove before retrying.

Open a new terminal after path or styling changes. You can rerun the same
selection: satisfied items stay unchanged and startup blocks are not duplicated.
For automation, provide an explicit selection and `--yes`, for example:

```sh
./tweak.sh apply --with uv,gh --yes
```

This approves the fresh plan printed by that invocation. Setup never removes
unrelated software. Existing changed configuration files are backed up with
their permissions under the printed run directory; see [recovery](recovery.md).
There is no automatic uninstaller or whole-run rollback.

## System preference choices

`./tweak.sh plan --preset system` previews the published system choices without
shell integration or tool dependencies. Each preference can keep the destination
value, remove its eligible user override, or save an explicit value. The native
editor is the usual way to customize them.

Advanced commands accept `--preferences-file /path/to/choices.json` with versioned
data, for example:

```json
{"version":1,"values":[{"id":"dock-size","mode":"set","value":63},{"id":"dock-recent","mode":"keep"}]}
```

Only settings belonging to selected groups may appear. Duplicate/unknown IDs,
unsupported values, malformed or excessive data, and redirected input files are
rejected. Use `"mode":"default"` without a value to remove an eligible user
override. Review retains the exact desired values; changing the input file or
target after review requires a fresh plan. See [system preferences](system-preferences.md)
for the bounded catalog, refresh guidance, and support coverage.

`./tweak.sh recover-preferences --run RUN-ID` reviews a recorded preference run
and asks before restoring its original keys. `--yes` is required for explicitly
approved noninteractive use. Later edits and uncertain outcomes are preserved;
see [recovery](recovery.md). This route does not restore tools or shell files.

## Development

```sh
/bin/bash tests/ci.sh
```

Tests use temporary home directories and controlled command paths. Python 3 is
a test dependency; it is not a setup runtime requirement. The default suite uses
local archive and transport fixtures. See [validation](validation.md) for
explicitly opted-in upstream downloads, native builds, and recovery smoke tests.
See [the component contract](architecture.md).

See [troubleshooting](troubleshooting.md) for preflight blockers and how to
resolve conflicts while retaining control of existing installations.
See [developer tools](tools.md) for versions, install methods, platform
support, and manual steps.
See [terminal components](terminal.md) for exact overrides, loading
precedence, and how existing customizations are handled.


GUI launchers remain attached to their native app. Ctrl+C requests normal guarded Quit and exits with status 130 after the app closes. A busy Apply/cleanup can refuse quitting; the terminal continues waiting, and a later Ctrl+C or window closure can finish shutdown. Normal red-button or Quit closure returns zero. This does not change the CLI apply/review interruption behavior.
