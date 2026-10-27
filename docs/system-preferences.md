# System preferences

Per-user settings and custom behavior groups use Review, accepted fixes, and Verify. Document migration and unrelated application installation remain outside this scope. The selected native helpers are built from repository source.

| Mode | Effect |
| --- | --- |
| Keep current | No preference write or reset |
| Use macOS default | Remove only the supported user override; inherited values can still apply |
| Explicit value | Save the selected typed value |

The versioned `src/catalog/preferences.json` has 101 fixed identities in 16 groups. The shared
model rejects arbitrary domains, keys, scopes, plist paths, types, enum values,
and numbers outside declared bounds. Recovery retains an original number's
integer or real representation.

## Published choices

| Group | Published choices | Additional settings initially kept |
| --- | --- | --- |
| Finder | List view | Hidden files, path bar, status bar, folders first, extension warnings, file extensions |
| Dock | Auto-hide on; size 49; magnification on at size 59; bottom; minimize into app icon on; recent apps off | None |
| Keyboard | Repeat interval 2; delay 25; automatic capitalization and double-space period on | Spelling correction |
| Screenshots | Keep current | PNG/JPEG/PDF/TIFF format, window shadows, floating thumbnail |

Choices were checked through narrow read-only inspection of the source Mac. An
absent key is not treated as false or copied as a reset. The published baseline
is fixed repository data, not a live account export. It contains no document
contents, Dock application list, screenshot destination, machine-specific path,
account, or credential.

## Mapping and support

| Domain | Allowlisted keys |
| --- | --- |
| `com.apple.finder` | `FXPreferredViewStyle`, `AppleShowAllFiles`, `ShowPathbar`, `ShowStatusBar`, `_FXSortFoldersFirst`, `FXEnableExtensionChangeWarning` |
| `com.apple.dock` | `autohide`, `tilesize`, `magnification`, `largesize`, `orientation`, `minimize-to-application`, `show-recents` |
| `NSGlobalDomain` | `AppleShowAllExtensions`, `KeyRepeat`, `InitialKeyRepeat`, `NSAutomaticCapitalizationEnabled`, `NSAutomaticPeriodSubstitutionEnabled`, `NSAutomaticSpellingCorrectionEnabled` |
| `com.apple.screencapture` | `type`, `disable-shadow`, `show-thumbnail` |

The catalog gates most preferences to macOS 13 through 27; Dock/launcher gestures require 27. Private key names
are a compatibility policy rather than a stable public Apple API. Source reads
and native bridge checks passed on macOS 27.0.1; older-release UI behavior needs
its own test environment. Saved-value verification does not prove an active
process has adopted a setting. Normal relaunch or signing out and back in may be
needed; setup never restarts processes or the login session automatically.

Managed policies and competing host-specific overrides receive manual guidance.
The setup does not remove profiles, elevate privileges, or replace entire domains.
The bridge uses Core Foundation services instead of editing preference plist files.

## Development checks

`/usr/bin/osascript -l JavaScript tests/preferences-model.js "$PWD"` checks
catalog/choice validation. `python3 tests/preferences.py` uses an explicit file
store and disposable home for types, absence, policy, stale plans, snapshots,
write/synchronization/readback failures, and preservation checks.

`MAC_TWEAK_PREFERENCES_LIVE_TEST=1 python3 tests/preferences-live.py` opts into
native writes in a fresh `org.macossetup.test.<UUID>` domain. It rejects production
Finder, Dock, global, and screenshot domains and cleans up its own test keys.
Changing HOME alone does not isolate preference services. Fixture and GUI tests
must use `MAC_TWEAK_PREFERENCES_TEST=1` and a temporary
`MAC_TWEAK_PREFERENCE_STORE` outside the disposable home.

Apple documents the user-facing [Finder](https://support.apple.com/en-gb/guide/mac-help/mchlp2803/27/mac/27),
[Dock](https://support.apple.com/guide/mac-help/change-desktop-dock-settings-mchlp1119/mac),
[keyboard](https://support.apple.com/guide/mac-help/set-how-quickly-a-key-repeats-mchl0311bdb4/mac),
and [screenshot](https://support.apple.com/guide/mac-help/take-a-screenshot-mh26782/mac)
options separately from these internal preference keys.

## Expanded controls

Appearance, accessibility, mouse, built-in/Bluetooth trackpads, windows/Spaces, desktop/widgets, sound, Spotlight and Terminal app controls supplement the original groups. The catalog is the complete domain/key/type/range list; code owns and validates the same identities. Unobserved newly exposed choices start at Keep current. Fractional pointer/delay/volume controls have explicit steps. Numeric 0/1 representations of boolean preferences are accepted and preserved exactly in snapshots.

The Preferences group picker retains drafts while changing groups. Tabs and card sections share `src/catalog/sections.json`; cards share their section's accent. Custom preserves selection and matching approval. Gray cards can be clicked to enter Custom and toggle once; deselecting Full also enters Custom. Search is removed. Zero-change review prompts explain that Apply is unavailable.

These are bounded preferences, not every possible macOS operation. Utilities links to Spotlight categories/privacy, keyboard shortcuts/modifiers, Accessibility, Login & Background Apps and all System Settings. Hardware, accounts, networking, battery/power, protected background approvals and privacy grants remain controlled by macOS. The app never invents a defaults key to bypass those controls.

See [custom behaviors](behaviors.md) for Windows keys, Dock/launcher gestures, closing apps and background activation. See [Terminal](terminal.md) for portable profile files. Appearance changes affect the destination Mac only after explicit reviewed application; they are independent of the chooser's Dark mode switch.

### Scroll bars

Choose **Appearance → Show scroll bars** for Automatic, When scrolling or Always. Keep current remains the default. Editing stays a draft until Review and Apply; the app's own scroll views inherit the saved system behavior rather than forcing a style.


## Display and screen protection

The current catalog has 102 fixed scalar identities in 17 editable groups, plus guided Wallpaper, Screen protection, Display and Power cards. The Display preset selects all five display cards. Full includes them; none changes wallpaper/saver/security/power choices by default.

Custom delay is edited in minutes with a slider and bounded minus/plus buttons shown for Set value and stored as `com.apple.screensaver/idleTime` seconds for the destination **current user/current host**. Zero is Never. Keep current schedules no write; macOS default removes only that host's override. Snapshots retain the exact scope, type and original, including absence; recovery preserves any-host inherited values. Managed policies block mutation. Saved-state checks cannot prove that every OS release has adopted private timing keys; Lock & display sleep remains available under Screen protection.

Wallpaper and screen-saver visuals (including aerials), password approvals and hardware-specific sleep/power settings open native macOS controls. Changes made there take effect in macOS and are not undone by cancelling an app draft. Review/Verify clearly mark these choices as requiring native checks. Saved files exposes exact local macOS store locations without exporting private wallpaper data or editing those files directly.


The store independently rejects wallpaper domains and screen-saver visual writes even if a malformed setting bypasses catalog validation. Only `screensaver-idle` / `com.apple.screensaver` / `idleTime` in current-user/current-host scope is permitted. Writes use a single typed CFPreferences key; they do not import a whole preference domain, change visual selection, restart wallpaper services, or broadcast simulated display-option notifications. Reduce motion stays Keep current by default. Native private-domain tests retain a nested visual sentinel in both host scopes across set/delete/restoration.


On modern macOS the Screen saver button targets Wallpaper's `ScreenSaver` subpage anchor; older versions retain the standalone pane. URL availability checks retain the anchor when choosing a fallback. Display and Power have independent cards and Preferences groups, while Screen protection contains only lock and display-sleep navigation. Custom delay remains in seconds in the retained review; changing groups preserves the draft, and Cancel does not commit it.


On first use of the modern screen-saver chooser, Mac Tweak opens Wallpaper first, waits for the native Settings window to finish launching and settle, then opens its ScreenSaver subpage. This avoids requesting a chooser before its current Auto/Custom state has loaded. Later opens reuse the hydrated Settings process; a restarted process or closed window loads again. A loading indicator covers the short wait. Closing the owning app/preferences cancels queued navigation. No Auto/Custom preference is written.
