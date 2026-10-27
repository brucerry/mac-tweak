# Source organization

The public entry points are `Tweak.command` and `tweak.sh`. Native hover tracking is registered when controls/documents are created, rather than rediscovered by the idle job timer. Scroll documents retain their layer backing across theme changes. Custom surfaces are borderless, and checked cards use filled selection marks. Information sheets use native dynamic colors without adding permanent theme painters.

```text
Tweak.command                double-clickable launcher
tweak.sh                     GUI default; forwards advanced commands
src/
  cli.sh                     backend entry point
  gui/main.js                native AppKit window and backend transport
  gui/state.js               pure selection, tab, and result state
  gui/dialogs.js             native fix recommendation dialogs
  lib/                       selection, inspection, planning, execution, verification
  preferences/               typed model, native bridge, isolated preference store
  components/
    tools/                   Node/npm, uv, gh, tig modules
    terminal/                prompt, aliases, colors, executable-path modules
    preferences/             Finder, Dock, keyboard, screenshot modules
  catalog/                   component and pinned-release data
  presets/                   editable preset definitions
  terminal/                  portable zsh snippets copied to the destination
tests/                       isolated behavior and native GUI checks
docs/                        advanced usage and contributor reference
```

The GUI runs with macOS's built-in JavaScript for Automation, AppKit, and
Foundation. It starts the backend with argument arrays, not shell interpolation.
No browser server, compiler, Python, Node, or package manager is needed to open
the chooser. The CLI uses macOS Bash 3.2 and system utilities.
The utility window uses a scrollable customization sidebar without search, ordered component sections, and a separate review panel. The section manifest supplies tab order and card accents. A Preferences sheet edits one selected group at a time while retaining drafts. Dark mode is a native switch; result rows combine green/orange/red icons and text. Stable polling preserves detail and component scrolling. Utilities exposes saved files, itemized cleanup and OS-controlled settings. Menu images explicitly request visibility on macOS 27; older systems retain their native behavior. Hover surfaces update geometry when their controls move, without idle control-tree scans.
When invoked from a translated shell on Apple Silicon, the backend restarts
with native Bash before inspecting or using developer tools. This also avoids
translated system shims trying to load an ARM-only Command Line Tools library.

The catalog is parsed as data and never evaluated. Only validated identifiers
select modules. Each module provides `component_inspect`; tool modules also
provide `component_apply`. Shared code applies declarative shell actions and
verifies the selection. Inspection cannot install, download, or create setup
state. Execution owns locking, backups, staging, activation, and reporting.
`src/lib/repair.sh` adds bounded repair planning and command preservation without
granting ordinary Apply permission to replace externally owned entries.

The sidebar discovers `src/presets/*.txt`, validates their component identifiers,
and gives new files scrollable rows. CLI preset names include terminal-app and behaviors; the GUI submits resolved component IDs to the same backend. Specific tabs gray unrelated components; clicking one enters Custom and toggles it. Entering or re-clicking Custom preserves selection and matching approval. Editing Full enters Custom. The GUI loads `state.js` as trusted
repository JavaScript; catalogs and preset contents remain parsed data.

## Graphical approval

A review starts a backend session that keeps its resolved actions and target
observations in memory. After successful planning it emits a unique token and
waits on its private input pipe. Apply sends that session's token. Changed
checkboxes invalidate the review; cancellation closes the pipe. Target drift
between review and application is still rejected by the backend. The CLI's
scripted `--yes` route remains an explicit advanced option.

Blocked or pending graphical results prepare recommended fixes. A repair session
uses a separate `repair:<token>` approval domain and holds the complete action
set in memory. The popup offers Apply, Cancel, and Later; Later retains
the same plan, while Cancel closes its input without mutation. Acceptance applies
that plan and starts ordinary verification automatically. User-local command
replacements are staged and checked before originals are preserved/replaced.
Their paths, ownership, resolved payloads, and signatures are checked again after
downloads and immediately before activation. Selected regular configuration can
be backed up and restored; symlinked targets, ambiguous blocks, and system
requirements receive manual guidance with no automatic-apply action.

Normalize AppKit integer properties before comparing them with JavaScript
numbers: JXA can expose 64-bit properties such as checkbox state and preset
indices as strings. Native regression checks exercise those control callbacks
and detailed-output rendering as well as the selection model.
Text alignment is derived from a native button's centered cell: newer macOS
ABIs can differ from JXA's exported enum values. Card fills use AppKit NSBox
colors, avoiding Core Animation CGColor bridging that can terminate JXA on
newer macOS.

A timer polls a private temporary output file so the native window stays
responsive. The GUI removes its transport files when the session closes. It
does not run a listener or persistent service. Verification is read-only.
Unchanged output is never rewritten. Appended output preserves a scrolled
reading position and follows the end only when the user was already there.
A fixed native scrollbar avoids repeated overlay flashing. Each action has a
labeled success, warning, or failure icon. Verify treats unapplied settings and
preflight requirements as orange warnings and actual failed checks as red
failures; full backend output remains in Details.
Verification continues reporting healthy installed tools when managed
configuration is still pending. `PASS`, `PENDING`, and `FAIL` checks distinguish
component health from complete adoption; any pending required change keeps the
overall exit status nonzero. The GUI lists working components separately from
needed shell setup and never hides a failed check behind a pending warning.

## Checks

`/bin/bash tests/ci.sh` checks syntax, fixtures, review transport, launchers, and
the GUI model. It also forces TERM and KILL during downloads and staged upgrades,
then checks prior activation, recorded edits, lock recovery, and successful retry.
`python3 tests/gui.py --native` also creates the native window and tests
review/cancel, reviewed application/verification, blocked preflight, stale
approval, application failure with retry, and verification failure in temporary homes.
Both appearances also cover scoped editing, Custom transitions, runtime theme
switching, retained approval, cached output, appended-output position, verification
warnings, and a sidebar populated with 40 extra presets.
Repair checks also cover ordinary-mode protections, approval domains, read-only
preview/cancellation, changed targets during download, preservation of relative
symlinks and regular executables, failed backups/staging, ownership adoption,
managed-link retry without downloads, and automatic verification. Native tests
exercise dialog decisions in both appearances; direct visual QA covers the real
modal buttons and manual-guidance view.
Native-window checks require a graphical login session. Test-only graphical
application is guarded by an explicit test environment and disposable home.

See [validation](validation.md) for live upstream checks and native coverage.
The [Apple JXA documentation](https://developer.apple.com/library/archive/releasenotes/InterapplicationCommunication/RN-JavaScriptForAutomation/Articles/OSX10-10.html)
describes the Objective-C bridge used by the window.

## Typed system preferences

The catalog and module dispatch distinguish tools, shell components, and
preferences. Preference-only runs have no shell dependency. System chooses the native system groups; Terminal app covers its app preferences and profiles; Behaviors covers custom helpers. Full includes every public choice.
The native Preferences sheet edits selected groups, with independent draft
Done/Cancel behavior and Keep current/default/explicit modes. Committed changed
values invalidate review; unchanged drafts and theme changes preserve approval.
The model's review key includes canonical selected preference choices.

The GUI writes bounded versioned JSON in its private transport directory and
submits IDs plus that file through argument arrays. The backend snapshots desired
values and observes input and trusted-source changes. It retains typed preference
actions alongside file/tool actions and uses distinct plan counts and result
wording. Recommendation dialogs group preference changes by component. Accepted
fixes apply and verify the same edited values automatically.

The Core Foundation bridge reads current-user/any-host values, host overrides,
effective values, and forced policy. Convert returned CF references with
ObjC.castRefToObject before inspecting them; pass typed write values with
ObjC.castObjectToRef. The native private-domain test covers false/zero and numeric
types so neither is confused with a null pointer or absence. No plist file is
modified directly and no entire domain is imported.

Before preference writes, the backend checks observations and preserves every
pending original with its native type/presence in preferences.json. Each action
is checked again immediately before writing. Per-key records distinguish
attempted, saved, and uncertain outcomes; later failures do not undo earlier work.
Explicit recovery validates run paths, original identities, typed snapshots, and
current versus recorded post-state before restoring only those keys. Older scalar
originals outside editor ranges remain recoverable. Unknown outcomes and later
edits require manual resolution.

Saved-value verification and no-op detection do not imply visible adoption by an
already-running process. Results keep refresh guidance separate, and no process
or login session is restarted automatically. The source Mac is checked read-only.
Fixture tests use an injected temporary store, because HOME alone is not a
CFPreferences sandbox. Explicit native tests are restricted to fresh private UUID
domains. See [system preferences](system-preferences.md) for the catalog, mapping, support, and checks.

Expanded settings and helpers use the same retained review and private run records. `src/catalog/sections.json` drives GUI tab/section order and accent. `src/behaviors/` holds classified Swift sources and metadata, `src/lib/helpers.sh` stages source builds and preserves helper apps, `src/terminal/profiles/` contains sanitized profile XML, and `src/components/profiles/` contributes reviewed profile file actions. Preferences uses a group picker with a retained full draft. Utilities is the explicit activation / OS-settings route; it does not bypass the plan to write preferences.

## Persistent resources and accepted maintenance

`src/maintenance/resources.js` maps catalog components to exact saved locations and scoped views, independently of transient plan logs. `src/gui/files.js` provides the permanent component browser. `src/maintenance/io.js` handles bounded local reads, SHA-256 fingerprints and isolated context validation; `model.js` performs read-only inventory and eligibility checks; `bridge.js` retains approved work in memory, coordinates the shared lock, moves accepted items through native Trash and stores receipts. `src/gui/maintenance.js` separates inventory, review, acceptance and results. The GUI writes owner PID/start markers into its private transport so active sessions cannot be cleaned.

The section manifest now requires five unique accents: Terminal coral, Terminal app blue, Development teal, System purple and Behaviors rose. Native tracking areas provide GitHub hover/cursor feedback. The existing appearance switch uses unlit/lit bulbs and accessible appearance labels.

## Mac Tweak interface and distribution

`src/app` contains version metadata and the universal native launcher. `src/gui/icons.js` loads locally bundled MIT Heroicons; `hover.js` supplies tracking-area feedback without affecting selection, and `activity.js` presents honest progress for read-only loading. `helpers.js` separates launch outcomes from the native adapter so missing/running/success/failure paths are tested without starting hooks. A native visual-effect backdrop follows macOS Reduce transparency and its accessibility notification.

`src/lib/compat.sh` and `src/project.js` select the existing storage identity when legacy roots exist. Stable helper preference/bundle/login IDs intentionally retain compatibility names. Source-Mac data is never renamed during development. Release tooling under `scripts/release` builds universal ZIP/PKG assets and verifies a disposable extraction without installation. See [releases](releases.md) and [maintenance utilities](maintenance-utilities.md) for the current scope.

Scroll views use AppKit's inherited preferred style and hide only unneeded scrollers. They do not force a legacy/overlay mode. macOS updates native scroll views when its scrollbar preference changes; the bounded `appearance-scrollbars` setting edits `NSGlobalDomain/AppleShowScrollBars` through the same retained review, typed apply and recovery flow. See [Apple's preferred scroller style](https://developer.apple.com/documentation/appkit/nsscroller/preferredscrollerstyle).


Display components add a `guided` kind for native OS-managed choices. `settings-pages.json` supplies the visible routes; an idle timing scalar alone uses the fixed current-user/current-host scope. Retained preference originals validate the catalog's exact scope. Existing identities retain any-host semantics. Guided rows never imply scripted changes or a verified external selection.

`behaviors/shared/InteractionSafety.swift` is included in both affected helper builds and fingerprints. It uses session state, workspace/distributed notifications and full-screen shield metadata; it never captures pixels or writes service settings. Numeric session flags are handled explicitly. Target filtering and last-moment rechecks protect system renderers and cancel stale app actions.

The source chooser's stay-open native host is generated by built-in `osacompile` and cached in `~/Library/Caches/io.github.brucerry.MacTweak/hosts`. It builds the UI and returns to the applet's existing AppKit loop, preserving the applet's event delegate. The standalone universal Swift launcher executes the same bootstrap through OSAKit in its own process, retains the script and starts its AppKit loop only after bootstrap execution returns. Each native host owns one main event loop. Both expose Mac Tweak's regular app identity. Developer smoke/model routes can still run directly in the isolated JXA harness, and model-only native invocations exit without leaving a stay-open applet. Inactive generated hosts are eligible for app-only cleanup; active hosts remain protected.

Repeated source launches use `open -W` without forcing a second instance; reopening restores the existing window and selection. Close, menu Quit and external normal Quit share the active-mutation guard and idle-session cleanup. Native shutdown is deferred until idle modal sheets have unwound, then stops and wakes the host's main event loop. Real lifecycle tests dispatch actions from delayed timers after loop entry, rather than quitting during startup. Quit-event handlers are installed after native launch registration so AppKit does not replace them. A blocked external request replies with cancellation, allowing a later Quit to work. The standalone NSApplication subclass forwards termination through the same controller. A scoped timer admits default-mode script events only while an owned modal panel/alert is open; it is removed when that UI closes and never runs during the host's own termination session.

Details parses activity into human-readable component/value lines and semantic attributed colors. New output appends to text storage when possible; theme refresh retains the viewport. The popup names concrete changes from the same retained plan and never changes the Details checkbox.


Native file operations live in `src/maintenance/native-files.js`. Native NSURL arrays avoid JXA's JavaScript-array coercion; asynchronous NSWorkspace recycling returns exact Trash destinations without dereferencing an unsafe NSURL** out-parameter. The retained approval includes this adapter's source fingerprint. Worker receipts include owner identity; recovery validates the review token, exited PID and current lock token. Terminal progress visibility is explicit rather than relying on stopAnimation to hide a determinate indicator.

`src/gui/presentation.js` reads session, process and full-screen shield metadata. Source launch uses background opening over a protected desktop; windows wait until the desktop is safe. Native UI tests preflight this state, normally launch in the background and never start/stop renderers. The explicit Finder interaction fixture uses normal foreground opening only after the desktop check. Transparency tests invoke the app's own observer handler rather than posting a simulated system notification. Menus receive separate raster template icons, preserving the original SVG images for tintable controls. The footer uses 52 points, with the reclaimed area added to navigation, cards and Details.


`src/gui/settings-navigation.js` coordinates first-use screen-saver navigation through an injected clock, native app/window metadata and URL adapter. It waits for a stable Settings window before requesting the modern screen-saver anchor, caches the hydrated PID, bounds loading to ten seconds and coalesces duplicate requests. Its timer runs only during a queued request in default and modal-panel run-loop modes. Preferences closure and app cleanup invalidate it and stop its progress sheet. Other Settings URLs and older standalone screen-saver panes remain direct. The coordinator does not mutate preferences or signal visual services.


## Terminal interrupt supervision

Public GUI launches run `src/app/launch.sh` as a small Bash supervisor. Its JXA host worker uses a separate background process group and null standard input, keeping terminal signals out of script/AppKit event handling. Traps publish an atomic numbered request in a private owner-validated temporary directory. The host sends normal Quit only to the app whose bundle and executable paths match its own cached source host. It does not force termination or signal app names. The waiter remains attached if the mutation guard vetoes Quit; a later request can complete after work finishes. Startup interruption skips launching a new app. Native shutdown cleans app transport first, then the waiter cleans its output and the supervisor removes its channel. Ctrl+C returns 130; normal red-button/Quit closure returns zero. Existing CLI and developer smoke/model routing remain separate.
