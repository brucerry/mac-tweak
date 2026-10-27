# Resolve a blocked plan

Preflight checks the entire selection before application. A blocker prevents all
selected changes. After resolving it, run a fresh plan and review it again.

| Message | Next step |
| --- | --- |
| External installation does not meet the version criteria | Accept the GUI's reviewed managed replacement, or update it through its existing manager. Repairs preserve the old installation and save displaced user-local command entries. Ordinary Apply still blocks the conflict. |
| Unmanaged executable conflict | The GUI can recommend preserving and replacing selected regular command files or links inside ~/.local/bin. Inspect Details before accepting; other locations and redirected parent directories require manual resolution. |
| Symlink conflict | The reported file or parent belongs to another configuration layout. Keep using that layout, or move the affected target to a regular user-owned location yourself. Setup never follows the link to edit its destination. |
| Unmanaged or edited configuration/integration block | A reviewed repair can back up and restore selected regular snippets or a well-formed setup integration block. Normal text outside the block is preserved. Redirected targets or ambiguous markers require manual resolution. |
| Malformed or duplicate markers | Inspect the reported startup file and reconcile its mac-tweak blocks. Keep one intact recorded block or remove the setup block yourself, then review the next plan. |
| Missing Command Line Tools | Run `xcode-select --install` yourself and finish Apple's installation. Setup never starts this privileged prerequisite installation. Select components without tig if you do not want the build tools. |
| Unsupported host | The runner supports macOS 13+ on native Apple Silicon and Intel. Individual releases can have stricter requirements; the Node release requires macOS 13.5+. Use a supported host or exclude the incompatible component. |
| Not writable | Inspect ownership and permissions of the named target or parent. Run setup as your normal user with a writable home directory. |
| Managed policy or host-specific override | Resolve the selected setting through System Settings or the administrator managing the Mac. The fix dialog cannot bypass policy or remove a profile. Keep current can leave that setting alone. |
| Preference changed after preview | Another process or user changed the selected key or its policy. Review again; the old approval cannot overwrite the newer value. |
| Later preference edit conflicts with recovery | Compare current System Settings with the recorded original and saved result. Recovery preserves newer edits until explicitly resolved. |
| Unknown preference outcome | Inspect the run's originals and per-key attempted/uncertain record. A write may have happened before interruption or synchronization failure; resolve it manually rather than importing a full domain. |
| Preference saved but not visible | Saved-state verification does not refresh an active process. Reopen normally or sign out and back in, then verify again if needed. |

All installation and configuration paths are derived from the destination user's
home directory. A custom `ZDOTDIR` requires using the default home-based zsh
startup layout for these components; the setup does not manage a second layout.
Preference-only choices are independent of ZDOTDIR and do not change shell files.

`verify` reports pending changes and path visibility separately from executable
health. After applying shell configuration, open a new terminal. Verification
checks managed snippets in a controlled shell; it does not execute arbitrary
existing startup scripts to inspect your environment.

`PASS [uv]` or `PASS [tig]` can appear together with pending shell PATH/loading:
the existing tools work, while the repository's shell integration has not been
applied. The GUI lists those working tools in an orange setup-pending result.
Review and apply the selected setup to finish adoption. Overall verification
remains nonzero until every required change is applied. For outdated external
tools, the popup can recommend a managed replacement that keeps their original
payloads and saves displaced command entries. Cancel makes no setup changes;
Details retains the plan for inspection before acceptance. System prerequisites,
unsupported hosts, symlinked targets, and ambiguous markers receive manual steps
without an automatic-apply button.


## Closing an app opened from Terminal

When `tweak.sh` or `Tweak.command` opens the GUI, Ctrl+C requests the app's normal Quit and keeps the terminal attached until it closes. If Apply or an accepted cleanup is running, the app keeps that work protected. Let it finish, then press Ctrl+C again or close its window. Ctrl+C returns terminal status 130 after shutdown; the red button or ordinary Quit returns zero when no interrupt was requested. No terminal interrupt force-quits the app or discards its run records.
