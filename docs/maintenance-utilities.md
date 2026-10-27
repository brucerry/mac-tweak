# Maintenance utilities

**Saved files…** is a permanent read-only browser. Choose a component to see exact current paths, allowlisted preference values and recovery records. Existing text can be previewed and revealed in Finder without Review. Missing files stay missing.

**Clean up temporary files…** lists only Mac Tweak's inactive staging, generated launcher caches and marked abandoned chooser transports. Active sessions, unsafe paths and live setup work are protected. It does not scan other apps' caches or user documents.

**Remove old saved configs…** lists recorded originals with individually confirmed successful replacements, including older runs without a whole-run completion marker. It keeps current settings and active files/apps. The chosen retention policy is **Keep current only**: accepting an original means there is no automatic backup left for that item. Old helper copies qualify only as recorded backups with a confirmed replacement; installed helper app bundles stay in place. A current helper can keep running while its separate old backup is removed; only an executing old backup is blocked. Unconfirmed, uncertain and unsafe recovery records remain protected. Every action in a preference-original group must have a valid saved outcome.

Each item has a checkbox and a clickable card. Filter by name/path and show all, selectable, selected or protected items. Filtering preserves choices. Nothing starts selected. Review shows the complete selected list, even if a filter hid some choices; a second explicit acceptance moves only that list to Trash. Cancel leaves everything unchanged.

**Select all shown** selects eligible cards in the filtered list, including required eligible dependencies. **Deselect all shown** clears the shown cards while preserving hidden choices. Protected cards cannot be selected. Selection controls are disabled during review and execution; bulk selection never accepts removal.

A retained review binds the item paths, contents, recovery events and current successor observations. Setup and maintenance share a lock. Changed files or preferences require a new review. No elevated privileges, automatic process quitting or Trash emptying occurs.

Progress appears only while work is running and resets for each run. Terminal results hide the bar and keep Refresh and Close available. A later failure leaves earlier successful moves in Trash, with completed/failed/unattempted results. Interrupted moves can be unknown. The receipt records exact original/Trash paths under `~/.local/state/mac-tweak/maintenance/<UUID>/receipt.json`; open **Saved files → Maintenance history** to inspect it. Existing installations continue using their original `macos-setup` storage root.

Restoring an accepted old original requires inspecting its Trash location and the current destination first. Removing `preferences.json` deliberately removes key-level recovery for that run; its remaining outcomes, run actions and maintenance receipt are retained. Never overwrite newer settings blindly.

Removal tests use private temporary homes. Actual macOS Trash is additionally exercised only with newly created disposable files; simulated adapters cover partial failure and interruption. Source and standalone modal workflows verify Finder reveal, native Trash and reusable utilities. Development does not clean source configuration or uninstall installed apps.

An abandoned app lock has an explicit **Release lock** prompt. Recovery is offered only when the recorded owner is confirmed absent. Accepting preserves the lock record and rechecks its identity before releasing it. Active/unknown owners and changed locks remain blocked. This action does not remove any backup or accept cleanup.

A completed worker releases its lock. If an accepted worker exits unexpectedly, its receipt preserves completed, failed and unattempted results; only unconfirmed attempts are unknown. The GUI may preserve/release that specific exited worker's lock when its receipt owner and fresh lock token match. An unrelated abandoned lock still requires the explicit recovery prompt. No existing receipt is discarded.


The selected count and total logical file size include choices hidden by filters. Inventory discovers sizes in the loading worker without hashing contents or following symlink targets. Unknown sizes are shown as unavailable. Exact review recomputes sizes with the retained content fingerprint; acceptance is still required. Moving files to Trash makes them recoverable; disk space is freed after Trash is emptied through macOS.
