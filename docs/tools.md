# Developer tools

All components support native Apple Silicon and Intel on the macOS releases
shown below. Setup itself requires macOS 13+. Downloads are fixed-version
upstream releases whose checked-in SHA-256 is verified before extraction or
execution. `./tweak.sh info ID` shows the current manifest details.

| ID | Installed release | Supported existing versions | macOS minimum | Method and exposed commands |
| --- | --- | --- | --- | --- |
| node | 24.22.1 | >=24.22.1, <25.0.0 | 13.5 | Node binary archive; node, npm, npx |
| uv | 0.13.5 | >=0.13.5, <0.14.0 | 13.0 | uv binary archive; uv, uvx |
| gh | 2.103.2 | >=2.103.2, <3.0.0 | 13.0 | GitHub CLI binary ZIP; gh |
| tig | 2.6.1 | >=2.6.1, <3.0.0 | 13.0 | Source release with system clang/ncurses; tig |

Managed releases live in `~/.local/opt/mac-tweak/TOOL/VERSION`. Only the
declared commands are linked into `~/.local/bin`, through a per-tool `current`
pointer. The automatically included `local-bin-path` dependency makes that
directory available to future login and interactive zsh sessions, without
enabling prompt, aliases, or colors unless you select them.

## Existing installations and updates

Working external tools meeting the published criteria are reused. Node also
requires working npm and npx; uv requires uvx. Setup leaves these installations
and their manager unchanged. An incompatible external version blocks the run
with instructions to update it through its existing manager or remove it
yourself. Ordinary Apply does not replace or shadow it. The GUI also offers a
separately reviewed repair: install the pinned managed release, preserve the
external installation, and back up selected user-local command entries before
switching them. The popup explains this change before acceptance. Setup does
not invoke the external package manager or change its installation files.

Managed tools converge to the checkout's fixed release. Updating the checkout
can offer a new version in the next plan; no tool is upgraded in the background.
The previous managed version is retained. A download, build, or staging check
failure leaves the prior active version intact.

## Prerequisites and approvals

Binary components use macOS curl, tar (including ZIP support), and shasum. The
runner's first invocation needs no package manager or installed development
runtime. uv does not install a Python runtime just by being selected; project
and Python environment configuration happens when you use uv later.

Tig requires working Git and Apple Command Line Tools, including make, clang,
and the SDK's ncurses/iconv support. Native helpers also require a working Swift
compiler. When these prerequisites are missing, Mac Tweak names the affected
selections and offers **Install** or **Later**. Install opens
[Apple’s official installer](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools)
using `xcode-select --install`. Finish any download, license or administrator
approval in that installer. Mac Tweak checks the required tools asynchronously,
then reviews the same selection again before offering Apply. A successful
installer request alone is never treated as a completed installation.
**Stop waiting** ends the check; Apple’s installer can continue independently.
Changing the selection or quitting also discards the pending continuation.
No system installer starts during Review or Verify without this separate approval.
The build explicitly uses native CPU targeting and system libraries, and uses
Tig's documented compatibility option when the compiler cannot include wordexp.

GitHub account access is separate: run `gh auth login` yourself when needed.
Setup does not copy or create credentials. Open a new terminal after path
changes, then run `verify` with the same component selection.

See [troubleshooting](troubleshooting.md), [recovery](recovery.md), and
[release maintenance](maintenance.md).
