# Validation coverage

Run `/bin/bash tests/ci.sh` for syntax checks and the isolated behavior suite.
It uses macOS Bash 3.2 and temporary home directories. Fixtures cover both
platform-selection branches, real archive extraction, preset customization,
conflicts, backups, failures, recovery, and no-op reapplication. Fake executable
fixtures validate routing and lifecycle behavior; they do not prove that an
upstream Intel or Apple Silicon binary runs on a simulated host.

The GitHub workflow provisions native macOS 15 Apple Silicon (`macos-15`) and
Intel (`macos-15-intel`) jobs, using the [published runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
Each job confirms its architecture and records coverage in its step summary.
Push and pull-request jobs run offline artifact fixtures. A manual dispatch with
`live_smoke` enabled also verifies upstream metadata and performs real downloads
and native installations in disposable homes.

## Current evidence

Recorded local results:

| Check | Evidence |
| --- | --- |
| Local syntax and isolated behavior | Passed on macOS 27.0.1, native Apple Silicon, system Bash 3.2 |
| Apple Silicon/Intel routing | Both branches passed with controlled platform and archive fixtures |
| Pinned upstream checksum metadata | Both architecture rows verified against upstream publications |
| Real tig source build | Passed locally, including verify and no-op reapplication |
| Full live setup | Passed on native Apple Silicon in a disposable home containing spaces: Node/npm, uv/uvx, gh, tig, and terminal configuration |
| Real managed version recovery | Node 24.22.0 -> 24.22.1 upgrade, recovery to 24.22.0, and catalog reactivation passed |
| Real binary architecture/minimum OS metadata | All six Node, uv, and gh arm64/x64 artifacts passed checksum and Mach-O header inspection; execution evidence is recorded separately below |
| Intel executable compatibility through Rosetta | Full live setup passed with actual x86_64 Node/npm/npx, uv/uvx, gh, and tig; Mach-O architecture and Node process architecture checked; upgrade, previous-release recovery, verification, and no-op reapplication passed |
| Intel tig build on Apple Silicon | Native ARM compiler cross-built x86_64 tig against the system SDK; the resulting executable ran under Rosetta |
| Translated-shell native setup | Real Full preflight from Rosetta passed, selected arm64, and created no setup state; the backend restarts with native Bash before invoking ARM-only Command Line Tools |
| Native graphical workflow | JXA/AppKit model, preview/cancel, review invalidation, reviewed aliases application, and verification passed in disposable homes |
| Native graphical failure results | Blocked preflight, stale approval, application failure, and verification failure passed; concise blockers or automatic details, disabled Apply, restored controls, and a fresh review/retry/verify were checked |
| Forced installation interruption | TERM and KILL during download and staged upgrade passed; the old Node release stayed active, completed edits remained recorded, TERM cleanup and KILL lock recovery worked, and retry/verify/no-op passed |
| Direct visual GUI review | Checked the rendered window, preset editing, direct checkbox selection, details output, review invalidation, application, and verification using a disposable account directory |
| Utility layout and theme control | Light/dark utility windows visually checked without slogans or decorative branding; all seven cards stay visible, the Dark mode switch preserves selections, results, detail position, and reviewed approval; theme text and active controls pass contrast checks |
| Scoped customization navigation | Terminal/Development scopes gray and disable unrelated items; entering Custom clears selections while re-clicking it preserves choices and approval; search and scrolling passed with 40 extra preset files, including direct search/selection through the native window |
| Stable detail scrolling | Idle polls cause no text rewrites; appended output preserves a scrolled reading position; direct scrolling and theme switching retained the displayed position with a fixed native scrollbar |
| Refreshed GUI regression | Success, cancellation, stale approval, application failure/retry, pending-setup warnings, version warnings, and failed health checks passed in both appearances; labeled green/orange/red results were visually reviewed and aliases were applied/verified in a disposable home |
| Whole-card selection and alignment | Empty space, icon, title, checkbox area, and a terminal card's far edge toggled once; scoped-out card clicks had no effect; native activation/focus checks passed in both appearances; visual checks confirmed one accessible checkbox per card, no content title, and aligned icon/text rows |
| Working tools versus pending adoption | Before adoption, read-only verification on the source Mac reported uv/tig passing with shell PATH/loading pending; isolated compatible-tool tests preserve filesystem snapshots, avoid downloads, and pass completely after application; real health failures still override pending warnings |
| Reviewed repair backend | Cancellation/EOF, wrong tokens/approval domains, stale targets, download/backup failures, command changes during download (including nested symlinks), original preservation, configuration restoration/adoption, and managed-link retry without downloads passed |
| Repair dialogs and automatic verification | Native acceptance, cancellation, details-first review, selected version replacement, manual requirements, stale approval, selection invalidation, and configuration repair passed in both appearances; real popup buttons were visually checked and a disposable accepted repair applied and verified automatically |
| Real external-to-managed repair | Live Node 24.22.0 -> 24.22.1 repair passed in a disposable home with spaces; the original payload and relative links were preserved, verification passed, and reapplication was a no-op |
| Source Mac repair preview | Full repair preview produced a plan for pending setup and existing Node/GitHub CLI blockers; cancellation preserved every inspected selected target |
| GitHub-hosted native jobs | Configured; their results become available after publishing the workflow |
| Native Intel execution | Not performed locally; requires the Intel CI runner or an Intel Mac |
| Minimum macOS 13/13.5 execution | Not performed locally; minimums come from the declared support policies, not a local test on those releases |

Coverage gaps remain visible rather than being inferred from a fixture pass.
Update this record when additional native results are available.

The default suite checks graphical review transport and the native GUI model
without opening a window. With a graphical login session, run
`python3 tests/gui.py --native` for the native-window success and failure tests.
`python3 tests/interruption.py` runs the four deterministic interruption cases
separately; they are also included in the default suite. These barriers cover
download and pre-activation staging, not every possible power-loss instant.
Runtime source
is organized under `src/`; `Tweak.command` and `tweak.sh` are root launchers.

## Opt-in live checks

```sh
python3 tests/releases.py --upstream
python3 tests/artifact-platforms.py --live
MAC_TWEAK_LIVE_TEST=1 /bin/bash tests/smoke.sh
MAC_TWEAK_LIVE_TEST=1 python3 tests/repair-live.py
```

On Apple Silicon with Rosetta already installed, also run:

```sh
MAC_TWEAK_LIVE_TEST=1 /bin/bash tests/smoke.sh --intel-translated
```

This first checks production Full planning from a translated shell. It then
masks host identity only in its disposable test environment to select the real
Intel recipes. The ARM compiler cross-builds tig; x86_64 tools execute through
Rosetta. The test does not install Rosetta or alter production host detection.
This validates real Intel code execution on this Mac, while native Intel hardware
and macOS 13/13.5 execution still need separate environments.

The platform check downloads pinned archives and inspects binary headers with
otool. The smoke test uses a copied checkout and a new temporary home containing
spaces. It installs a previous real Node release when Node is selected, applies
the current selection, verifies it, checks a no-op rerun, and exercises previous
release recovery. It then removes the disposable checkout and home. It never
applies the setup to your actual account. Python 3 is a test dependency only.

To check just the real tig source build:

```sh
MAC_TWEAK_LIVE_TEST=1 /bin/bash tests/smoke.sh --with tig
```

## Initial system preference evidence (before catalog expansion)

| Check | Evidence |
| --- | --- |
| Typed catalog and read-only inspection | All 22 identities and published choices passed unknown/duplicate/type/range/enum validation. False, zero, absence, numeric representation, effective values, host overrides, forced policy, and inspection failures are distinguished |
| Reviewed preference application | Injected-store checks passed input validation, mixed plans, cancellation, stale tokens/values/policies, snapshots before writes, set/delete, backup/write/synchronization/readback failures, retry, and no-op verification |
| Native preference service | Explicit private UUID-domain checks passed false/zero/integer/real/string round trips, typed property-list snapshots, synchronization, deletion, and restoration; the test adapter rejects production domains |
| Interrupted preference work | TERM/KILL retained originals and uncertain outcomes. Lock handling, retry, and no-op passed. Drift during an earlier Node download prevented subsequent preference writes and preserved partial results |
| Explicit recovery | Actual confirmation/cancellation, exact scalar types and absence, originals outside editor choices, new recovery records, stale approval, later edits, unknown outcomes, redirected records, and unrelated-key preservation passed |
| Native preference GUI | Both appearances passed all eleven cards, the original seven-card viewport, scoped System navigation, stable scrolling, actual sheet Done/Cancel, typed controls, draft/theme retention, edited-value review invalidation, popup acceptance/details/cancellation, stale approval, manual policy guidance, failed writes/retry, Keep current, and automatic verification |
| Direct visual review | Light/dark settings, scoped cards, group scrolling, slider alignment, hidden inactive values, one-line Details, popup actions, and green results were checked. A size-64 draft was accepted into an injected store; exactly 12 keys changed, their originals/outcomes were inspected, and the preview was removed |
| Applied source account | Read-only Full verification passes all twelve resolved components, including four system groups and the path dependency, with zero changes, installations, or blockers. All 22 source preference stored/effective/host/policy observations remained identical after tests and visual acceptance |

Run `python3 tests/gui-preferences.py` for native preference workflows in both
appearances. The default suite includes preference model/backend, interruption,
race, and explicit recovery checks. They use an injected store and a disposable
home; HOME alone does not isolate CFPreferences. To explicitly test native
services in a fresh private domain, run:

```sh
MAC_TWEAK_PREFERENCES_LIVE_TEST=1 python3 tests/preferences-live.py
```

Native preference-service checks ran on Apple Silicon macOS 27.0.1. Actual
Finder/Dock/typing/screenshot UI adoption is not inferred from private-domain
storage tests. Other OS/hardware behavior remains a coverage gap; development
does not change the source account's selected preferences to fill it. The
existing Intel CI jobs can exercise the private-domain check with live smoke
validation after the workflow is published.

## Expanded chooser and setup evidence (2026-10-26)

The current catalog supersedes the initial card/count evidence above: 24 public cards, 101 typed settings in 16 native preference/behavior groups, five ordered card sections and six presets. No search field remains. Custom preserves selections and matching approval; gray-card clicks and Full edits enter Custom.

| Check | Current evidence |
| --- | --- |
| Backend regression | `tests/ci.sh` passed 76 PASS groups on native Apple Silicon macOS 27.0.1 / Bash 3.2, including all existing tool/shell/recovery/approval checks |
| Native GUI | 41 legacy and 18 preference checks passed across light/dark; group-picker drafts, scoped clicks, Full-to-Custom, approval retention/invalidation, stable scroll, failures/retry and result labels passed |
| All catalog identities | Every one of 101 settings completed isolated typed set, snapshot, readback, no-op, and exact restoration; this includes original numeric boolean zero and fractional pointer speed |
| Native services | UUID-private-domain typed round trips and production-domain rejection passed; source-domain writes were not used |
| Native helpers | All three Swift sources built and ran only --self-test; isolated helper/profile installation, source/ownership verification, login records, repeat no-op, unowned modification rejection, and pre-mutation compiler failure passed |
| Direct visual checks | Native light/dark layout, section colors/order, GitHub icon, group picker and close labels checked; no-change dialog appeared and Apply stayed disabled; Custom retained the three reviewed Terminal choices; Utilities menu and missing-selection guard worked |
| Source Mac | All 101 stored/effective/host/policy observations matched before/after tests. Read-only System Verify reports 0 configuration changes, 0 preference changes, 0 installs, 0 blockers |
| Full on source Mac | Read-only Full correctly reports two existing-helper migration blockers. Full also includes new helper configuration and profile resources, so the original twelve-component Full no-op result is historical. No source helper, login agent, keyboard map, active Terminal profile, or system preference was applied or replaced |

Protected background/Accessibility approvals, actual live input interception, app-quit dialogs, HID hot-plug behavior, and visible adoption of private preference keys across macOS/hardware versions remain interactive checks. Saved-state verification does not certify those behaviors. Dock/launcher gestures are gated to macOS 27; other supported settings begin at 13. The temporary native preview and its home were removed after review. Profiles are sanitized resources and are opened explicitly through Utilities; existing Terminal profiles remain intact.

Additional checks: `python3 tests/helpers.py` and `python3 tests/expanded-preferences.py` are part of the default suite. Helper tests never start input hooks. The source audit compares all native observation fields, not just the displayed scalar.

## Saved configuration and maintenance evidence (2026-10-26)

The default backend suite passed 85 PASS groups, including the prior 76 groups, permanent-resource review, and eight maintenance lifecycle groups. Native validation passed 41 legacy, 18 preference, and 16 saved-files/maintenance groups across light/dark. The latest scoped modifier/profile preview cases were additionally rerun after adding absent-key and privacy-filter guards.

Owned native view renders verified GitHub hover presentation, the unlit/lit bulb, five unique section accents, saved-path/content layout, itemized exact-path acceptance, and persistent cleanup/removal results. The render uses the test app's own layer tree; it does not capture the desktop or other apps. Per-component details were checked without a Review and after reopening; scoped false values, binary plist display, safe dotfile links, source device maps, sanitized Terminal profile fields, recovery records and stale-row references passed read-only checks.

Maintenance fixtures passed empty defaults, read-only inventory, cancellation and wrong tokens, explicit Trash acceptance and receipts, stale content, concurrent setup locks, helper/login dependency acceptance, app-start races, partial failures, interrupted attempting/unknown outcomes, recovery-path forgery and production-fixture rejection. Actual source-Mac cleanup/uninstall and native Trash were not invoked. All destructive tests used private temporary roots, a separate HOME, app/process fixtures and an isolated Trash adapter.

After validation all 101 source-Mac stored/effective/host/policy preference observations and 14 real shell/configuration/helper hashes matched their audit baseline. Read-only System Verify still reports zero file/preference changes, installs or blockers. Setup recovery originals and source app bundles remain intact. Receipts live under the destination user's setup state and can be reopened through Saved files → Maintenance history.

Additional native maintenance coverage: `python3 tests/gui-maintenance.py`. Developer references and scope are in [maintenance utilities](maintenance-utilities.md).

## Mac Tweak 0.1.0 validation (2026-10-26)

This section supersedes the earlier broad app-removal scope. Maintenance now cleans only this app's generated temporary files and explicitly accepted old configuration originals, keeping current settings and installed apps. Unknown/failed runs stay protected.

- Full `tests/ci.sh`: 92 PASS groups, including isolated helper builds, all 101 settings, stale/partial/interrupt cases, rename compatibility and release-note checks.
- Native chooser: 41 PASS groups in light/dark appearances; preference editor: 18; maintenance/details: 16. Own-view renders cover the new About icon/layout, section colors, filterable cards, acceptance/results and both transparency states. A native workspace notification refreshes the backdrop without changing a preference.
- Native launch adapter: a unique, disposable short-lived app confirms real success and missing-app failure. Real input/window helpers are never launched. Separate fixtures cover missing, already-running, invalid, successful and failed helper states.
- Maintenance backend: 10 PASS groups, including current-only original cleanup, running helper protection, preference-original acceptance/cancellation, changed successor/preferences, uncertain results, forged paths, partial moves and interrupted receipts.
- Private UUID preference-domain checks pass and reject production domains. All 101 source preference observations and 14 source configuration/helper hashes match the audit baseline. Read-only System Verify reports zero file/preference changes, installs or blockers.
- Universal ZIP and PKG are locally extracted and inspected without installing. Checks cover both Mach-O slices, ad-hoc signature, version/identity, all shipped source files, complete ZIP-versus-installer payload equality, manifest and checksums. Local pkgbuild emits metadata permission warnings; the verified payload bytes are identical. The installer is unsigned and neither asset is notarized.
- GitHub workflows pass actionlint 1.7.12. Apple Silicon and Intel hosted jobs are prepared; they have not run on GitHub because the source/workflows have not been pushed. No release/tag is published.
- The GitHub repository is `brucerry/mac-tweak`; its unchanged repository ID and new remote were verified. Development lives only at `/Users/bruce/github/mac-tweak`, with no old directory or symlink. The Codex project path was updated while preserving its trust value. Existing end-user installation storage/helper identities retain explicit compatibility support.

The final scrollbar refinement removes all forced styles from chooser, editor, saved files and maintenance views. The existing `appearance-scrollbars` control remains Keep current by default and provides all three native choices. Updated native suites cover inherited presentation and stable interaction. The old development alias is absent; no current launcher or repository reference points to it.


## Wallpaper safety and hybrid Display validation (2026-10-26)

The updated catalog has 27 public cards, seven presets and 102 scalar identities across 17 typed groups. The new Display section has a sixth unique accent. Wallpaper/saver visuals and protected lock/power choices use native controls; per-host idle timing is edited in minutes, defaults to Keep current and has scoped original/recovery coverage. Appearance no longer forces Dark by default.

The regression run reports 94 PASS groups; targeted native chooser (41), editor (18), maintenance (16) and both-theme Display views pass. Private UUID-domain tests confirm current-host round trips do not leak into any-host values and reject production domains. Fixture cases cover inherited timing, absence recovery, managed-policy rejection, invalid minute steps, native routes/drafts and honest manual verification. Metadata-only policy tests cover protected renderer IDs, normal apps/Finder, lock/inactive/saver/sleep states, numeric session flags and full-screen versus cursor-sized shields. Real lock/saver activation remains an interactive check and was not triggered during development.

A retained source-Mac repair review contained exactly two helper rebuilds, with zero configuration/link, preference or tool actions. The accepted run is `20261026T104615Z-48535`; old apps are retained beneath its backups directory. Only DockMinimizer and QuitOnRed were normally stopped/restarted. After the user's native Accessibility approval, both report Accessibility=true and active event taps; Dock's Finder and Alt+Tab taps also report true. Their source/ownership verification is a no-op.

WallpaperAgent and the aerial/Macintosh/dynamic wallpaper renderer process IDs stayed unchanged. Both existing screen-saver plist hashes and all 102 observed preference states match the pre-update audit. The macOS-managed wallpaper Index.plist changed earlier during inspection, so its whole-task hash is not claimed unchanged; its 10:31:32 UTC modification predates the 10:46:15 UTC helper update. No tweak code rewrites it or removes wallpaper assets. No recorded prior appearance-style action was found in setup history.

Universal release ZIP/PKG, complete payload/source comparisons, ad-hoc signature, manifests/checksums and actionlint validation pass locally. Hosted CI and release publication remain pending a source push.


The title-bar follow-up exposed a gap in earlier content-only renders: a clear NSWindow background also cleared native chrome outside the content effect view. The base background now stays opaque, native title visibility/background is explicit, and the content effect still follows Reduce transparency. Full owned-frame captures include title/traffic-light regions in both themes and both transparency states; dialog/panel chrome is covered as well. No desktop or unrelated app pixels are captured.

## Responsive interface and launcher refinement (2026-10-26)

Public launchers are now `tweak.sh` and `Tweak.command`; runtime references, current documentation, tests and bundled resources use the new names. Historical archived specifications and compatibility storage names remain historical. Launcher tests cover a checkout with spaces, GUI/default/CLI routing and absence of the old entry points. Package verification also checks executable permissions and exact launcher bytes.

Profiling identified a full AppKit control-tree hover scan taking about 102 ms, scheduled every 200 ms. Hover registration now occurs on control/document changes; 100 idle polls perform zero scans and complete below the millisecond timer resolution. Cached palettes, active-only hover recoloring and appearance-only control updates remove redundant theme work. Native samples after the change report theme update scheduling around 19–29 ms, versus 31–34 ms before the refinement. These are synchronous update/submission timings, not measured display latency or a claim about end-to-end frame rate. Scroll documents retain layer backing; actual trackpad smoothness remains subject to interactive assessment.

The complete regression suite passes 94 groups. Native chooser and editor suites pass 41 and 18 groups; maintenance passes all 16 scenarios plus 10 bulk-selection assertion groups in light/dark. A final targeted interaction check reconfirms theme changes with a retained review and many-tab scrolling. Owned full-frame/content renders cover borderless color hovers, filled checkbox marks, aligned Info typography/selectable saved paths and both transparency modes. Repeated Info windows add no permanent theme painters.

Bulk controls honor text/state filters, preserve hidden choices, include eligible dependencies and reject protected rows. Review freezes both bulk and individual selection, and cancellation/stale/partial/interrupted fixtures still require exact retained acceptance. Production cleanup, preference writes and helper replacement are not part of this refinement's validation. Local release assets are prepared and inspected with the renamed launchers through `scripts/release/build.py` and `scripts/release/verify.py`.


## Cleanup, native identity and readable review (2026-10-26)

The old-config inventory on this Mac contained 14 blocked originals. Validation now uses each item's recorded successful replacement instead of requiring a newer whole-run completion marker. Historical preference cleanup accepts validated known-key subsets when the catalog has grown, while Apply/recovery plan validation remains strict. The current helper can keep running; only an executing old backup is protected. Unknown outcomes, missing successors, stale observations and active locks remain blocked.

The abandoned lock owned by the absent process 7294 was explicitly released through the token-bound recovery route and preserved under `~/.local/state/macos-setup/maintenance/abandoned-lock-A81D6020-2195-4037-A729-9184BF709598`. Fresh inventory then made all 14 originals eligible. All 24 files inside those originals retained their SHA-256 hashes. No original was removed, no Trash operation ran, and no helper or system preference was changed. The GUI offers the same explicit recovery prompt for future abandoned locks.

Both source and standalone windows now expose `io.github.brucerry.MacTweak`, name Mac Tweak, regular activation and real native bundle executable paths. Source uses a cached built-in applet; standalone uses OSAKit inside the universal launcher process. Metadata from both actual hosts passes the existing helper target policy. Native own-window minimize/restore succeeds after waiting for animation. Test failures go to test logs rather than applet error dialogs; the popup seen during the first test was a premature minimization assertion. Helper binaries and privacy identities were not rebuilt or changed.

The regression run passes 101 groups, including 11 maintenance lifecycle groups, readable activity parsing and five real native-host/policy checks. Native chooser/editor/maintenance suites pass 41/18/26 groups across both appearances. Final owned renders verify inset navigation, one Info value column, checkboxes centered with multiline text and icons, concrete recommendations, stable Apply/Later controls, semantic red/green activity and native frosted material/translucent surface metadata. Reduce transparency retains solid surfaces and readable chrome. Partial-line streaming and theme recoloring retain the activity viewport; Later retains the same review without enabling Details. Fixture source caches are protected while active and become eligible after the host exits.

Local release packaging includes the bootstrap and OSAKit host, with a regular app identity and both launcher architectures. Package inspection checks versions, signature, full source/payload equality and checksums without installation or publication.


## Native shutdown and reopening (2026-10-27)

The two idle source instances that could not close were identified by their exact executable paths and stopped. A process sample showed a second AppKit event loop inside the applet's running script event. The stay-open source applet now returns after UI construction and preserves its original event delegate; the standalone host retains the OSA script and enters its one main loop from Swift after execution returns. Repeated source launch restores the same window and selection.

`tests/app-host.py` now adds 14 delayed lifecycle scenarios to its five native identity/policy/model checks. Each host exercises Close, menu Quit, external normal Quit, reopen without duplicate instances, active-work Close/menu veto, external Quit veto followed by successful idle retry, and Quit with an idle sheet open. Actions occur after loop entry; successful shutdown requires process exit, removed session transport and no remaining native instance. Scoped modal and external-veto/retry cases pass for both hosts. The original startup-only smoke did not cover this behavior.

Quit handlers register after native launch so the default handlers do not replace them. Blocked external requests reply with cancellation. A modal-only bridge admits default-mode script events while app-owned UI is open; final loop stopping waits until sheets have unwound. Source and release hosts retain the same regular app identity and unchanged helper exclusions.

Info/saved-files and utility cancellation views were rerun in both appearances, with no accepted cleanup. Production configuration, preferences, helpers and their privacy approvals were not changed. The production app remains closed. Release assets are prepared locally through the build/inspection commands; none are installed or published.


## Native utility regressions (2026-10-27)

The source cleanup receipt `6B9A1CF1-90FB-483A-888B-A2AD6C481D8C` was pending with one attempting item and later items unattempted. The matching osascript 63121 crash report shows EXC_BAD_ACCESS in JSOCRef wrapping while retaining an Objective-C result. The original worker dereferenced an NSURL** result after native Trash; simulated moves had missed this platform path. The replacement uses a typed native NSURL array and NSWorkspace's asynchronous URL mapping. Real disposable-file checks cover success, a native missing-file failure and an exact recoverable destination. Both actual hosts exercise Finder reveal from a modal browser and native Trash/failure/interruption through the actual utility sheet.

The exact abandoned source lock was preserved at `~/.local/state/macos-setup/maintenance/abandoned-lock-B57BDBA1-ADA4-457A-8F95-0F710DC505FD`; both existing source receipt hashes stayed unchanged. No source cleanup or old-config removal was retried automatically. New GUI terminal results hide progress, preserve individual receipt statuses and recover only their own exited worker's lock. Filtered selection and explicit acceptance remain intact. Native menu icons are checked for nontransparent bitmap pixels, and both-theme owned views verify the compact footer and retained saved-file browser content/error feedback.

The selected saver provider remains Macintosh. No screen-saver/renderer crash report was found; original visual-service PIDs and the screen-saver/accessibility plist hashes match the pre-test audit. The OS-managed wallpaper Index.plist changed later during validation, so its complete hash is not claimed unchanged; the selected Dynamic desktop and Macintosh saver providers remain the same. Reduce motion and Low Power Mode report off. macOS logged Wallpaper settings/XPC/CoreUI diagnostics while its settings UI was active; these do not establish a renderer crash or an application cause. No test invoked saver start, stop or restart; animation health is not claimed verified. Native UI tests now refuse protected sessions and no longer post simulated accessibility-change notifications.

The expanded lifecycle run exposed an additional validation-harness issue: constructing a maintenance context on each idle timer repeatedly spawned shell processes and nested task waits on the GUI thread. A process sample showed event dispatch being starved. Lifecycle fixtures now cache that setup once, retain delivery/cancellation/cleanup assertions, use real bundle launches, and check normal NSRunningApplication Quit plus acknowledged PID-addressed Quit events. The complete 14-case lifecycle set then passes in both hosts.

The protected-desktop guard stopped one late native case; those stages were resumed only after the desktop again reported safe. Coverage across the backend and resumed native runs totals 125 PASS groups, plus both-theme owned-view assertions. Local universal release ZIP/PKG payload, source-byte equality, signature, manifest and checksum inspection pass without installation or publication.


## Utility rendering, selected sizes and visual-state boundaries (2026-10-27)

The actual open Utilities menu reproduced missing icons despite valid, nontransparent image buffers. macOS 27 defaults menu image visibility to Automatic, which normally hides them; each utility now requests Visible when the API exists. An interactive native-menu inspection verified all ten icons on this Mac. Older macOS versions retain the normal image API.

Maintenance now shows selected logical file size, including filtered choices and eligible dependencies; protected rows are excluded and unknown sizes are explicit. A worker measures inventory without hashing file contents or following symlink targets. Exact review remeasures through its retained fingerprint. Isolated filesystem tests cover nested/hidden files and a link to an unrelated original. Native controls cover hidden choices, bulk deselection, dependencies, unavailable sizes and exact review totals. Owned renders verify Close hover at x834 after results and x576 after Refresh, without a stale hover surface. Terminal progress and exact itemized acceptance remain intact.

The preference store rejects visual wallpaper/screen-saver writes independently of catalog validation, permitting only the supported current-user/current-host idleTime setting. Native tests use one fresh private UUID domain, retain a nested visual sentinel in both host scopes through set/delete/restoration and reject malformed visual writes. No test writes production display preferences or restarts visual services. Existing helper policy tests retain renderer/system/session exclusions.

For the explicitly requested local Macintosh repair, settings and process identities were saved privately before a one-time recovery. Terminating only the old renderer left WallpaperAgent holding an invalid XPC connection (4099) and falling back to an aerial. The normal per-user wallpaper-agent termination rebuilt that connection and launched a fresh Macintosh extension. macOS choices were returned to their original values; all wallpaper configuration matches the snapshot apart from macOS-managed LastUse/LastSet timestamps, and screen-saver/accessibility preference files are byte-identical. A protected launchctl restart was refused by macOS; no protection was changed. Native visual verification is pending because the desktop is locked; process restart alone is not proof of working animation. This recovery is not part of the app or its automated tests.


Focused dark-appearance native cleanup/remove runs passed selection totals, exact acceptance, success receipts, both moved Close positions and reusable inventories. Maintenance lifecycle tests passed cancellation, stale contents, failures, interruption, lock ownership and actual logical-size discovery. The wider backend run reached the real-launcher check, then correctly refused the locked desktop; the remaining non-UI verification, repair, preference/race/recovery, helper, saved-file and expanded-setting checks were run separately and passed. Expanded-setting application/recovery preserves injected visual state for every catalog setting; native CFPreferences checks independently preserve nested state in both host scopes. This is not reported as an uninterrupted all-green CI run. Remaining native presentation and animation confirmation require an unlocked desktop.

The user subsequently confirmed that Macintosh animation works and the GUI check is complete (2026-10-27). This closes the manual animation confirmation without another service restart or settings change.


## Compact Info and focused display controls (2026-10-27)

Info now uses a 560 × 324 point content area for a normal single-line saved path, with 32-point metadata-row spacing and matching value columns. It grows vertically for long selectable paths; both-theme fixture renders cover a wrapped path without clipping. Finder reveal clears successful feedback text while retaining actual errors, stale-path disabling and the browser contents.

Screen saver navigation keeps the modern Wallpaper `ScreenSaver` anchor when resolving a missing standalone pane, and retains the standalone route on older systems. The duplicate timing link is removed. Custom delay (min) adds minus/plus buttons only for Set value, with one-minute increments, 0/Never and 180-minute limits. Native tests cover both limits, hidden/disabled controls, exact seconds in drafts, unchanged uncommitted model state and retention when switching to Power and back. This also fixes observed timing overwriting a previously edited draft after a group change.

Display and Power are independent guided cards in the Display section and Full. Each Preferences group has exactly one native action; Screen protection contains only Lock & display sleep. The CLI checks prove standalone guided selection/review/verification schedules no settings writes or unrelated protection choices. The current catalog has 29 public cards and the same 102 scalar preference identities.

Targeted owned-window checks pass in both appearances, alongside GUI model/routing, saved-resource, hybrid-display, managed-policy, range and release-note checks. Native route tests inspect the exact current-host URL and both legacy/modern availability cases; they do not manipulate System Settings or activate a screen saver. A separate real modal Finder check stopped before reveal because the disposable app did not become foreground (Edge remained active), including one fresh retry; it is not counted as a pass. Both-theme owned-control tests cover silent success and visible failures using the retained native adapter boundary.

The post-test audit matches the complete wallpaper-store, screen-saver, host-specific screen-saver and accessibility file hashes and the original wallpaper-agent/Macintosh/Dynamic renderer PID/start identities. No visual service was started, restarted or signaled by this refinement. Local release assets are rebuilt and verified without installation or publication.


## Screen-saver chooser state on fresh launch (2026-10-27)

The reported mismatch occurred only after a fresh System Settings launch. The saved wallpaper store still recorded separate desktop/idle choices (`individual`) and Macintosh as the idle provider; an already-loaded Wallpaper page showed Custom correctly. First-use modern chooser navigation now opens Wallpaper, waits for the Settings app's finished-launching state and a stable normal window, then opens the ScreenSaver anchor. The hydrated PID is cached for direct later opens; a restarted process or missing window reloads the parent. This changes launch order rather than forcing Auto/Custom or editing the wallpaper store.

`tests/settings-navigation.js` passes 24 injected-clock/adapter checks for cold and warm starts, restarted processes, stable readiness, disappearing windows, cancellation, timeout, protected desktops and failed native launches. Both-theme native chooser checks pass indeterminate loading progress, duplicate-request coalescing, completion cleanup, direct warm navigation and cancellation without late URL dispatch. The timer is registered in default and modal-panel run-loop modes and is invalidated when the owning preferences/app closes. The checks do not start System Settings or a visual service.

The user then tested the real fresh-launch flow after reopening Mac Tweak from Tweak.command and confirmed that Wallpaper opened first, followed by the chooser showing the saved Custom mode. This is explicit user verification of the native selector, not an inference from URL tests. The read-only audit finds all visual configuration unchanged when excluding macOS-managed LastUse/LastSet metadata; the wallpaper store's raw bytes changed during native Settings use, while screen-saver, host-specific screen-saver and accessibility files remain byte-identical. WallpaperAgent, Macintosh and Dynamic renderer PID/start identities remain unchanged. No mode, visual preference or service was modified by this fix.

Local release ZIP/installer resources and documentation are refreshed and verified without installation or publication.


## Terminal Ctrl+C lifecycle (2026-10-27)

The prior launchers replaced the terminal command with a waiting JXA/open process, while LaunchServices owned the app separately. They had no interrupt-to-native-Quit relay. The public GUI branch now keeps a Bash supervisor and isolates its JXA worker in a background process group. An atomic private request channel forwards each interrupt as normal Quit to the exact cached app path. Busy operations retain the normal veto. Startup cancellation does not open a new app, and session/output/control files are removed only after shutdown. No force termination is used by production code.

`tests/terminal-signals.py` uses real pseudo-terminals with inert JXA workers and passes ten cases across both entry points: Ctrl+C, busy-style refusal/retry, normal close, TERM and HUP. The worker's separate process group, returned statuses and channel removal are asserted. `tests/terminal-interrupt.py` uses real public launchers in a copied checkout with spaces, a private HOME/store and a unique native bundle identity. Twelve actual native cases pass across tweak.sh and Tweak.command: preparation cancellation, idle Ctrl+C, Ctrl+C with a modal sheet, active-work veto and retry, normal red-button closure, and reuse of one existing app by two attached terminals. The interrupted caller returns 130 while a non-interrupted attached caller returns zero. Native app exit, unchanged fixture preferences, app session cleanup and request-channel cleanup are required.

The existing source/standalone tests additionally pass native identity/model checks and delayed modal Quit, active-work external Quit veto/retry and reopening (eleven groups). Original launcher/CLI/terminal routing checks pass. PTY tests drain terminal output while waiting, matching a real terminal; they send actual VINTR bytes rather than directly signaling the app. Native checks stopped while macOS reported a locked desktop and resumed after the user unlocked it. The new signal suites are part of GitHub CI.

Local release packages include the supervisor and are rebuilt and inspected without installation or publication.
