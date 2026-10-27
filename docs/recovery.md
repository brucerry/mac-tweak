# Inspect and recover an application

Each mutating run prints its directory under
`~/.local/state/mac-tweak/runs/`. `summary.txt` records the selection and catalog
digest. `events.txt` is pipe-delimited data, **never a script to source**:

| Event | Second field | Third field |
| --- | --- | --- |
| backup | Changed file | Copy of its original contents and permissions |
| changed | Changed file | SHA-256 after this run's edit |
| create | New configuration file | Empty |
| directory | Newly created configuration/install directory | Empty |
| previous-link | Managed pointer or command link | Previous destination |
| create-link | New managed link | Empty |
| create-release | New retained tool release directory | Version |
| tool | Successfully activated tool | Version |
| failed | Failed action | Empty |
| interrupted | Active configuration path or tool | Signal received (INT or TERM) |
| preserved-command | Command path replaced by an accepted repair | Saved original regular file or symlink |
| replaced-command | Replaced command path | New managed destination |
| repaired-links | Tool whose managed links were repaired | Managed version |
| preference-originals | Typed preference snapshot | Supported preference scope |
| preference-attempt | Setting identifier | Per-key outcome record |
| preference-saved | Saved setting identifier | Per-key saved-value record |

Completed actions remain after a later failure. Read the results and records
before recovering or retrying. There is no automatic whole-run rollback or
uninstaller. Old managed tool releases remain available.

## Restore selected system preferences

A run with preference changes preserves `preferences.json` before its first
preference write. It contains only the planned keys, including each key's domain,
scope, original presence, native type, and value. Binary property-list data keeps
the original integer/real representation. `preferences-results/SETTING-ID.json`
records attempted, saved, or uncertain outcomes. These files are private data;
do not source them or import an entire preference domain.

To review and restore a run's saved keys:

```sh
./tweak.sh recover-preferences --run CHOOSE-THE-RUN-ID
```

Use the directory name printed by that run. The command checks the current values
against the recorded saved results, shows the original values it would restore,
and asks for approval. Advanced noninteractive use also requires `--yes`.
Cancellation changes nothing. Later edits, changed managed policy, redirected or
invalid records, and uncertain outcomes block restoration with an explanation.
Do not delete those records to bypass a conflict.

Recovery restores only recorded keys. A previously absent override is removed;
stored booleans, strings, and numeric types are restored exactly, including
original scalar values outside the current editor's choices. Unrelated keys and
preference domains remain intact. Recovery creates its own run and preservation
records. It restores the prior settings, so Verify against the published choices
can correctly report differences afterward.

A failed write or synchronization/readback error may leave a saved value even
when the run fails. A forced interruption can leave an `attempted` outcome.
Inspect originals, per-key outcomes, and current System Settings before resolving
those cases manually. The command does not claim automatic rollback or overwrite
an outcome it cannot prove. Keep earlier run records through recovery.

Preference results describe saved state. Reopen the affected process normally or
sign out and back in if needed; setup never restarts Finder, Dock, other processes,
or the login session automatically. See [system preferences](system-preferences.md).

## Restore a command displaced by repair

An accepted repair saves selected existing command entries under its run's
`backups/command-N` paths before replacement. Symlinks are saved without following
them; a saved relative symlink may not resolve until restored at its original
command location. External installation directories remain intact. Regular
command files keep their original bytes and permissions in the backup.

Find the `preserved-command` event, compare the current command with subsequent
run records, and assign the reviewed original path and saved entry. Restore it
through a temporary sibling so an existing managed link is not followed:

```sh
command_path="$HOME/.local/bin/CHOOSE-THE-COMMAND"
preserved_entry="/absolute/path/from/the/preserved-command/event"
restore_dir=$(mktemp -d "$(dirname "$command_path")/.mac-tweak-restore.XXXXXX") &&
  cp -Pp "$preserved_entry" "$restore_dir/command" &&
  /bin/mv -fh "$restore_dir/command" "$command_path" &&
  rmdir "$restore_dir"
```

Check the restored command and version. Retain managed releases and ownership
records for inspection. A later ordinary plan can report the restored entry as
a conflict; accept a new repair only if you want to use the managed commands
again. Configuration repairs use the ordinary per-file backups below.

## Restore an existing configuration file

Choose the printed run directory and inspect its records:

```sh
setup_run="$HOME/.local/state/mac-tweak/runs/CHOOSE-THE-RUN"
cat "$setup_run/summary.txt" "$setup_run/events.txt"
```

For example, find the original `.zshrc` backup and restore it:

```sh
startup_backup=$(awk -F '|' -v target="$HOME/.zshrc" \
  '$1 == "backup" && $2 == target { print $3 }' "$setup_run/events.txt")
test -n "$startup_backup" && cp -p "$startup_backup" "$HOME/.zshrc"
```

First compare the current file's checksum with that run's `changed` record and
review the file. If it differs, later edits or runs have changed it; reconcile
those changes before restoring. `cp -p` restores the saved file permissions too.
Restoring startup files does not remove installed tools or unrelated files.

For newly created files there is no original backup. The `create` and `changed`
records identify them; only remove a newly created file after confirming its
contents have not changed. Keep unrelated files and shared directories.

## Restore a previous managed tool

Find the `previous-link` event for the tool's `current` pointer. Check that both
the current and previous destinations are the intended version directories
under your `~/.local/opt/mac-tweak/TOOL/`. Check subsequent run records before
undoing an earlier run. For example, after assigning the reviewed pointer and
previous destination:

```sh
tool_pointer="$HOME/.local/opt/mac-tweak/node/current"
previous_release="/absolute/path/from/the/reviewed/previous-link/event"
test ! -e "$tool_pointer.recovery" && test ! -L "$tool_pointer.recovery" && \
  ln -s "$previous_release" "$tool_pointer.recovery" && \
  /bin/mv -fh "$tool_pointer.recovery" "$tool_pointer"
```

After a successful manual pointer restoration, update its ownership record as
plain data so a future plan recognizes the restored managed version:

```sh
pointer_record=$(printf '%s' "$tool_pointer" | shasum -a 256 | awk '{print $1}')
printf 'link:%s\n' "$previous_release" > \
  "$HOME/.local/state/mac-tweak/ownership/$pointer_record"
```

Command links point through `current`, so switching that pointer activates the
previous release. Verify the intended executable and version afterwards. A
future apply plan can offer the catalog version again. Externally managed tools
are unchanged by setup and are recovered through their existing manager.

If a run was interrupted, inspect its records and the PID in
`~/.local/state/mac-tweak/lock/pid`. Remove a leftover lock only after confirming
that application is no longer running. Do not delete the whole state directory:
it contains ownership information needed to distinguish managed files from
unmanaged collisions.

An INT or TERM interruption records the active step and releases the application
lock. A forced kill or power loss cannot run cleanup, so a lock may remain without
an `interrupted` event. Completed actions and earlier backups still apply. A
download or staged upgrade interrupted before activation leaves the previous
tool active; a fresh approved run can retry after lock recovery. Unfinished
private staging directories may remain in that run or as `.release.*` directories
inside a tool's base directory. Inspect their paths and confirm no application
is running before removing them; preserve retained version directories and
ownership records. An interruption during activation may require comparing the
pointer and ownership records with the run's link events before retrying.

## Cleanup and removal receipts

Utilities moves accepted items to Trash rather than permanently deleting them. The exact original and Trash destinations are saved in ~/.local/state/mac-tweak/maintenance/<UUID>/receipt.json and can be reopened under Saved files → Maintenance history. Keep existing setup backups and records. Restore only after inspecting current paths; interrupted `attempting`/unknown outcomes require checking both the original location and Trash. See [maintenance utilities](maintenance-utilities.md) for scope, partial results and stale-lock handling. Old-config cleanup preserves current files and installed apps. Accepting removal of preference originals deliberately disables recovery for that run; their Trash destination is retained in the receipt.

## Product rename compatibility

New installations use `mac-tweak` configuration, state and tool roots. If any original `macos-setup` root exists, Mac Tweak keeps using that installation’s paths, original shell markers and Terminal profile names. Helper preference suites, login identities and bundle IDs stay stable to preserve settings and privacy approvals. No data migration runs implicitly. Saved files shows the actual paths in use.
