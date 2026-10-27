/* Trusted code shared by the native editor and preference bridge. Data is never evaluated. */
(function () {
    'use strict';
    var groups = ["finder", "dock", "keyboard", "screenshots", "appearance", "accessibility", "mouse", "trackpad", "windows", "desktop", "sound", "spotlight", "terminal", "gestures", "closing", "windowskeys", "screensaver"];
    var allowed = {
        "screensaver-idle": ["com.apple.screensaver", "idleTime", "number"],
        "finder-view": [
                "com.apple.finder",
                "FXPreferredViewStyle",
                "string"
        ],
        "finder-hidden": [
                "com.apple.finder",
                "AppleShowAllFiles",
                "boolean"
        ],
        "finder-path": [
                "com.apple.finder",
                "ShowPathbar",
                "boolean"
        ],
        "finder-status": [
                "com.apple.finder",
                "ShowStatusBar",
                "boolean"
        ],
        "finder-folders-first": [
                "com.apple.finder",
                "_FXSortFoldersFirst",
                "boolean"
        ],
        "finder-extension-warning": [
                "com.apple.finder",
                "FXEnableExtensionChangeWarning",
                "boolean"
        ],
        "finder-extensions": [
                "NSGlobalDomain",
                "AppleShowAllExtensions",
                "boolean"
        ],
        "dock-autohide": [
                "com.apple.dock",
                "autohide",
                "boolean"
        ],
        "dock-size": [
                "com.apple.dock",
                "tilesize",
                "number"
        ],
        "dock-magnification": [
                "com.apple.dock",
                "magnification",
                "boolean"
        ],
        "dock-magnified-size": [
                "com.apple.dock",
                "largesize",
                "number"
        ],
        "dock-position": [
                "com.apple.dock",
                "orientation",
                "string"
        ],
        "dock-minimize": [
                "com.apple.dock",
                "minimize-to-application",
                "boolean"
        ],
        "dock-recent": [
                "com.apple.dock",
                "show-recents",
                "boolean"
        ],
        "keyboard-repeat": [
                "NSGlobalDomain",
                "KeyRepeat",
                "number"
        ],
        "keyboard-delay": [
                "NSGlobalDomain",
                "InitialKeyRepeat",
                "number"
        ],
        "keyboard-capitalization": [
                "NSGlobalDomain",
                "NSAutomaticCapitalizationEnabled",
                "boolean"
        ],
        "keyboard-period": [
                "NSGlobalDomain",
                "NSAutomaticPeriodSubstitutionEnabled",
                "boolean"
        ],
        "keyboard-spelling": [
                "NSGlobalDomain",
                "NSAutomaticSpellingCorrectionEnabled",
                "boolean"
        ],
        "screenshots-format": [
                "com.apple.screencapture",
                "type",
                "string"
        ],
        "screenshots-shadow": [
                "com.apple.screencapture",
                "disable-shadow",
                "boolean"
        ],
        "screenshots-thumbnail": [
                "com.apple.screencapture",
                "show-thumbnail",
                "boolean"
        ],
        "finder-trash-warning": [
                "com.apple.finder",
                "WarnOnEmptyTrash",
                "boolean"
        ],
        "finder-desktop-icons": [
                "com.apple.finder",
                "CreateDesktop",
                "boolean"
        ],
        "finder-internal-disks": [
                "com.apple.finder",
                "ShowHardDrivesOnDesktop",
                "boolean"
        ],
        "finder-external-disks": [
                "com.apple.finder",
                "ShowExternalHardDrivesOnDesktop",
                "boolean"
        ],
        "finder-removable": [
                "com.apple.finder",
                "ShowRemovableMediaOnDesktop",
                "boolean"
        ],
        "finder-servers": [
                "com.apple.finder",
                "ShowMountedServersOnDesktop",
                "boolean"
        ],
        "finder-save-folders-first": [
                "com.apple.finder",
                "_FXSortFoldersFirstOnDesktop",
                "boolean"
        ],
        "dock-launch-animation": [
                "com.apple.dock",
                "launchanim",
                "boolean"
        ],
        "dock-indicators": [
                "com.apple.dock",
                "show-process-indicators",
                "boolean"
        ],
        "dock-scroll-open": [
                "com.apple.dock",
                "scroll-to-open",
                "boolean"
        ],
        "dock-single-app": [
                "com.apple.dock",
                "single-app",
                "boolean"
        ],
        "dock-hidden-transparency": [
                "com.apple.dock",
                "showhidden",
                "boolean"
        ],
        "dock-effect": [
                "com.apple.dock",
                "mineffect",
                "string"
        ],
        "dock-hide-delay": [
                "com.apple.dock",
                "autohide-delay",
                "number"
        ],
        "dock-hide-time": [
                "com.apple.dock",
                "autohide-time-modifier",
                "number"
        ],
        "keyboard-press-hold": [
                "NSGlobalDomain",
                "ApplePressAndHoldEnabled",
                "boolean"
        ],
        "keyboard-smart-quotes": [
                "NSGlobalDomain",
                "NSAutomaticQuoteSubstitutionEnabled",
                "boolean"
        ],
        "keyboard-smart-dashes": [
                "NSGlobalDomain",
                "NSAutomaticDashSubstitutionEnabled",
                "boolean"
        ],
        "keyboard-text-replacement": [
                "NSGlobalDomain",
                "NSAutomaticTextReplacementEnabled",
                "boolean"
        ],
        "keyboard-inline-prediction": [
                "NSGlobalDomain",
                "NSAutomaticInlinePredictionEnabled",
                "boolean"
        ],
        "keyboard-function-keys": [
                "NSGlobalDomain",
                "com.apple.keyboard.fnState",
                "boolean"
        ],
        "keyboard-caps-input": [
                "com.apple.HIToolbox",
                "AppleCapsLockSwitchToABC",
                "boolean"
        ],
        "screenshots-date": [
                "com.apple.screencapture",
                "include-date",
                "boolean"
        ],
        "screenshots-clipboard": [
                "com.apple.screencapture",
                "target",
                "string"
        ],
        "appearance-style": [
                "NSGlobalDomain",
                "AppleInterfaceStyle",
                "string"
        ],
        "appearance-auto": [
                "NSGlobalDomain",
                "AppleInterfaceStyleSwitchesAutomatically",
                "boolean"
        ],
        "appearance-accent": [
                "NSGlobalDomain",
                "AppleAccentColor",
                "number"
        ],
        "appearance-scrollbars": [
                "NSGlobalDomain",
                "AppleShowScrollBars",
                "string"
        ],
        "appearance-tabs": [
                "NSGlobalDomain",
                "AppleKeyboardUIMode",
                "number"
        ],
        "accessibility-reduce-motion": [
                "com.apple.universalaccess",
                "reduceMotion",
                "boolean"
        ],
        "accessibility-reduce-transparency": [
                "com.apple.universalaccess",
                "reduceTransparency",
                "boolean"
        ],
        "accessibility-contrast": [
                "com.apple.universalaccess",
                "increaseContrast",
                "boolean"
        ],
        "mouse-natural": [
                "NSGlobalDomain",
                "com.apple.swipescrolldirection",
                "boolean"
        ],
        "mouse-speed": [
                "NSGlobalDomain",
                "com.apple.mouse.scaling",
                "number"
        ],
        "mouse-secondary": [
                "com.apple.driver.AppleBluetoothMultitouch.mouse",
                "MouseButtonMode",
                "string"
        ],
        "mouse-zoom": [
                "com.apple.driver.AppleBluetoothMultitouch.mouse",
                "MouseButtonDivision",
                "number"
        ],
        "trackpad-built-in-tap": [
                "com.apple.AppleMultitouchTrackpad",
                "Clicking",
                "boolean"
        ],
        "trackpad-built-in-secondary": [
                "com.apple.AppleMultitouchTrackpad",
                "TrackpadRightClick",
                "boolean"
        ],
        "trackpad-built-in-drag": [
                "com.apple.AppleMultitouchTrackpad",
                "TrackpadThreeFingerDrag",
                "boolean"
        ],
        "trackpad-built-in-drag-lock": [
                "com.apple.AppleMultitouchTrackpad",
                "DragLock",
                "boolean"
        ],
        "trackpad-built-in-pinch": [
                "com.apple.AppleMultitouchTrackpad",
                "TrackpadPinch",
                "boolean"
        ],
        "trackpad-built-in-rotate": [
                "com.apple.AppleMultitouchTrackpad",
                "TrackpadRotate",
                "boolean"
        ],
        "trackpad-bluetooth-tap": [
                "com.apple.driver.AppleBluetoothMultitouch.trackpad",
                "Clicking",
                "boolean"
        ],
        "trackpad-bluetooth-secondary": [
                "com.apple.driver.AppleBluetoothMultitouch.trackpad",
                "TrackpadRightClick",
                "boolean"
        ],
        "trackpad-bluetooth-drag": [
                "com.apple.driver.AppleBluetoothMultitouch.trackpad",
                "TrackpadThreeFingerDrag",
                "boolean"
        ],
        "trackpad-bluetooth-drag-lock": [
                "com.apple.driver.AppleBluetoothMultitouch.trackpad",
                "DragLock",
                "boolean"
        ],
        "trackpad-bluetooth-pinch": [
                "com.apple.driver.AppleBluetoothMultitouch.trackpad",
                "TrackpadPinch",
                "boolean"
        ],
        "trackpad-bluetooth-rotate": [
                "com.apple.driver.AppleBluetoothMultitouch.trackpad",
                "TrackpadRotate",
                "boolean"
        ],
        "windows-title-action": [
                "NSGlobalDomain",
                "AppleActionOnDoubleClick",
                "string"
        ],
        "windows-group": [
                "com.apple.dock",
                "expose-group-apps",
                "boolean"
        ],
        "windows-spaces-order": [
                "com.apple.dock",
                "mru-spaces",
                "boolean"
        ],
        "windows-switch-space": [
                "com.apple.dock",
                "workspaces-auto-swoosh",
                "boolean"
        ],
        "windows-span": [
                "com.apple.spaces",
                "spans-displays",
                "boolean"
        ],
        "windows-close-confirm": [
                "NSGlobalDomain",
                "NSCloseAlwaysConfirmsChanges",
                "boolean"
        ],
        "windows-restore": [
                "NSGlobalDomain",
                "NSQuitAlwaysKeepsWindows",
                "boolean"
        ],
        "windows-tabs": [
                "NSGlobalDomain",
                "AppleWindowTabbingMode",
                "string"
        ],
        "desktop-stage-manager": [
                "com.apple.WindowManager",
                "GloballyEnabled",
                "boolean"
        ],
        "desktop-desktop-widgets": [
                "com.apple.WindowManager",
                "StandardWidgetAppearance",
                "number"
        ],
        "desktop-show": [
                "com.apple.WindowManager",
                "StandardHideDesktopIcons",
                "boolean"
        ],
        "desktop-click": [
                "com.apple.WindowManager",
                "EnableStandardClickToShowDesktop",
                "boolean"
        ],
        "sound-feedback": [
                "NSGlobalDomain",
                "com.apple.sound.beep.feedback",
                "boolean"
        ],
        "sound-ui": [
                "com.apple.systemsound",
                "com.apple.sound.uiaudio.enabled",
                "boolean"
        ],
        "sound-beep": [
                "NSGlobalDomain",
                "com.apple.sound.beep.volume",
                "number"
        ],
        "spotlight-menu": [
                "com.apple.Spotlight",
                "MenuItemHidden",
                "boolean"
        ],
        "spotlight-suggestions": [
                "com.apple.lookup.shared",
                "LookupSuggestionsDisabled",
                "boolean"
        ],
        "terminal-secure": [
                "com.apple.Terminal",
                "SecureKeyboardEntry",
                "boolean"
        ],
        "terminal-focus": [
                "com.apple.Terminal",
                "FocusFollowsMouse",
                "boolean"
        ],
        "terminal-line-marks": [
                "com.apple.Terminal",
                "ShowLineMarks",
                "boolean"
        ],
        "gestures-minimize": [
                "org.macossetup.gestures",
                "minimizeEnabled",
                "boolean"
        ],
        "gestures-alt-tab": [
                "org.macossetup.gestures",
                "altTabEnabled",
                "boolean"
        ],
        "gestures-launcher": [
                "org.macossetup.gestures",
                "launcherEnabled",
                "boolean"
        ],
        "gestures-clear-search": [
                "org.macossetup.gestures",
                "clearSearchEnabled",
                "boolean"
        ],
        "gestures-login": [
                "org.macossetup.gestures",
                "startAtLogin",
                "boolean"
        ],
        "closing-red": [
                "org.macossetup.closing",
                "enabled",
                "boolean"
        ],
        "closing-edge": [
                "org.macossetup.closing",
                "edgeQuitEnabled",
                "boolean"
        ],
        "closing-terminal": [
                "org.macossetup.closing",
                "terminalQuitEnabled",
                "boolean"
        ],
        "closing-login": [
                "org.macossetup.closing",
                "startAtLogin",
                "boolean"
        ],
        "windowskeys-mapping": [
                "org.macossetup.windowskeys",
                "enabled",
                "boolean"
        ],
        "windowskeys-login": [
                "org.macossetup.windowskeys",
                "startAtLogin",
                "boolean"
        ]
};
    function fail(message) { throw new Error(message); }
    function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function keys(value, required, optional) {
        if (!object(value) || required.some(function (key) { return !Object.prototype.hasOwnProperty.call(value, key); }) ||
            Object.keys(value).some(function (key) { return required.concat(optional || []).indexOf(key) < 0; })) fail('Invalid preference fields.');
    }
    function text(value, maximum) { return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\r\n\t|\x00-\x1f]/.test(value); }
    function scalar(value, type) {
        return typeof value === type && (type === 'number' ? isFinite(value) : type === 'string' ? text(value, 256) : true);
    }
    function choice(setting, value) {
        keys(value, ['mode'], ['value']);
        if (['keep', 'default', 'set'].indexOf(value.mode) < 0) fail('Unknown preference action: ' + setting.id);
        if (value.mode !== 'set') {
            if (Object.prototype.hasOwnProperty.call(value, 'value')) fail('Unexpected value: ' + setting.id);
            return { mode: value.mode };
        }
        if (!scalar(value.value, setting.type)) fail('Invalid value type: ' + setting.id);
        if (setting.type === 'number' && (Math.abs(value.value / (setting.step || 1) - Math.round(value.value / (setting.step || 1))) > 0.000001 || value.value < setting.minimum || value.value > setting.maximum)) fail('Value outside allowed range: ' + setting.id);
        if (setting.type === 'string' && setting.values.indexOf(value.value) < 0) fail('Unsupported value: ' + setting.id);
        return { mode: 'set', value: value.value };
    }
    function catalog(data) {
        keys(data, ['version', 'settings']);
        if (data.version !== 1 || !Array.isArray(data.settings) || data.settings.length !== Object.keys(allowed).length) fail('Invalid preference catalog version or count.');
        var seen = {};
        data.settings.forEach(function (row) {
            keys(row, ['id', 'component', 'domain', 'key', 'label', 'type', 'minOS', 'maxOS', 'refresh', 'choice'], ['minimum', 'maximum', 'values', 'titles', 'step', 'scope']);
            var identity = allowed[row.id];
            if (!identity || seen[row.id] || row.component !== row.id.split('-')[0] || groups.indexOf(row.component) < 0 ||
                row.domain !== identity[0] || row.key !== identity[1] || row.type !== identity[2]) fail('Unknown or duplicate preference identity: ' + row.id);
            if(row.id==='screensaver-idle'?row.scope!=='current-user-current-host':row.scope!==undefined)fail('Invalid preference scope: '+row.id);
            seen[row.id] = true;
            if (!text(row.label, 80) || !text(row.refresh, 200) || !/^\d+\.\d+$/.test(row.minOS) || !/^\d+\.\d+$/.test(row.maxOS) || Number(row.minOS) < 13 || Number(row.maxOS) <= Number(row.minOS)) fail('Invalid preference metadata: ' + row.id);
            if (row.type === 'number' && (!scalar(row.minimum, 'number') || !scalar(row.maximum, 'number') || row.minimum > row.maximum)) fail('Invalid numeric bounds: ' + row.id);
            if (row.type === 'string' && (!Array.isArray(row.values) || !row.values.length || !Array.isArray(row.titles) || row.values.length !== row.titles.length || row.values.some(function (v, i) { return !text(v, 32) || row.values.indexOf(v) !== i || !text(row.titles[i], 40); }))) fail('Invalid preference choices: ' + row.id);
            if (row.step !== undefined && (row.type !== 'number' || !scalar(row.step, 'number') || row.step <= 0 || row.step > row.maximum - row.minimum)) fail('Invalid numeric step: ' + row.id);
            choice(row, row.choice);
        });
        return data.settings;
    }
    function desired(settings, selected, request) {
        if (!Array.isArray(selected) || selected.some(function (id, i) { return groups.indexOf(id) < 0 || selected.indexOf(id) !== i; })) fail('Invalid selected preference groups.');
        request = request || { version: 1, values: [] };
        keys(request, ['version', 'values']);
        if (request.version !== 1 || !Array.isArray(request.values) || request.values.length > settings.length) fail('Invalid preference request.');
        var values = {};
        request.values.forEach(function (row) {
            keys(row, ['id', 'mode'], ['value']);
            var setting = settings.filter(function (item) { return item.id === row.id; })[0];
            if (!setting || values[row.id] || selected.indexOf(setting.component) < 0) fail('Unknown, duplicate, or unselected preference: ' + row.id);
            var input = { mode: row.mode };
            if (Object.prototype.hasOwnProperty.call(row, 'value')) input.value = row.value;
            values[row.id] = choice(setting, input);
        });
        return settings.filter(function (item) { return selected.indexOf(item.component) >= 0; }).map(function (item) {
            return { id: item.id, choice: values[item.id] || choice(item, item.choice) };
        });
    }
    function describe(value) { return value.mode === 'keep' ? 'Keep current' : value.mode === 'default' ? 'Use macOS default' : String(value.value); }
    return { catalog: catalog, desired: desired, choice: choice, scalar: scalar, keys: keys, groups: groups, describe: describe };
}())
