import AppKit
import CoreGraphics

// Metadata only: never starts/stops a saver, captures pixels or changes settings.
enum WindowActionPolicy {
    static func allowsTarget(bundleID: String?, path: String?, regular: Bool, allowFinder: Bool = false) -> Bool {
        guard regular, let bundleID, !bundleID.isEmpty, let path, path.hasPrefix("/") else { return false }
        if allowFinder && bundleID == "com.apple.finder" { return true }
        let id = bundleID.lowercased(), executable = path.lowercased()
        let protected = ["com.apple.finder", "com.apple.dock", "com.apple.systemuiserver", "com.apple.controlcenter", "com.apple.notificationcenterui", "com.apple.loginwindow", "com.apple.windowserver"]
        return !protected.contains(id) && !id.hasPrefix("com.apple.wallpaper") && !id.hasPrefix("com.apple.screensaver")
            && !executable.hasPrefix("/system/library/") && !executable.contains("/screen savers/")
    }
    static func allows(_ app: NSRunningApplication, allowFinder: Bool = false) -> Bool {
        !app.isTerminated && allowsTarget(bundleID: app.bundleIdentifier, path: app.executableURL?.path,
                                          regular: app.activationPolicy == .regular, allowFinder: allowFinder)
    }
    static func flag(_ value: Any?) -> Bool? {
        guard let number=value as? NSNumber, number.doubleValue==0 || number.doubleValue==1 else { return nil }
        return number.boolValue
    }
    static func canInteract(onConsole: Bool, loggedIn: Bool, locked: Bool, saver: Bool, awake: Bool) -> Bool {
        onConsole && loggedIn && !locked && !saver && awake
    }
    static func isFullScreenShield(layer: Int, alpha: Double, bounds: CGRect, displays: [CGRect]) -> Bool {
        guard layer >= Int(CGWindowLevelForKey(.screenSaverWindow)), alpha > 0.01 else { return false }
        return displays.contains { display in
            let overlap = display.intersection(bounds)
            return display.width > 0 && display.height > 0 && overlap.width >= display.width * 0.95 && overlap.height >= display.height * 0.95
        }
    }
    static func selfTest() {
        precondition(flag(NSNumber(value:1))==true && flag(NSNumber(value:0))==false && flag("unknown")==nil && flag(NSNumber(value:2))==nil)
        for id in ["com.apple.wallpaper.agent", "com.apple.wallpaper.extension.aerials", "com.apple.wallpaper.extension.macintosh", "com.apple.wallpaper.extension.dynamic", "com.apple.ScreenSaver.Engine", "com.apple.loginwindow"] {
            precondition(!allowsTarget(bundleID: id, path: "/Applications/Example.app/Contents/MacOS/Example", regular: true))
        }
        precondition(!allowsTarget(bundleID: "org.example.renderer", path: "/System/Library/ExtensionKit/Extensions/Other.appex/Contents/MacOS/Other", regular: true))
        precondition(!allowsTarget(bundleID: "org.example.saver", path: "/Library/Screen Savers/Other.saver/Contents/MacOS/Other", regular: true))
        precondition(!allowsTarget(bundleID: "org.example.background", path: "/Applications/Other.app/Contents/MacOS/Other", regular: false))
        precondition(!allowsTarget(bundleID: nil, path: nil, regular: true))
        precondition(allowsTarget(bundleID: "com.microsoft.edgemac", path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", regular: true))
        precondition(allowsTarget(bundleID: "com.apple.Terminal", path: "/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal", regular: true))
        precondition(allowsTarget(bundleID: "com.apple.finder", path: "/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder", regular: true, allowFinder: true))
        precondition(canInteract(onConsole: true, loggedIn: true, locked: false, saver: false, awake: true))
        precondition(!canInteract(onConsole: false, loggedIn: true, locked: false, saver: false, awake: true))
        precondition(!canInteract(onConsole: true, loggedIn: false, locked: false, saver: false, awake: true))
        precondition(!canInteract(onConsole: true, loggedIn: true, locked: true, saver: false, awake: true))
        precondition(!canInteract(onConsole: true, loggedIn: true, locked: false, saver: true, awake: true))
        precondition(!canInteract(onConsole: true, loggedIn: true, locked: false, saver: false, awake: false))
        let display = CGRect(x: 0, y: 0, width: 1920, height: 1080)
        precondition(isFullScreenShield(layer: 1000, alpha: 1, bounds: display, displays: [display]))
        precondition(!isFullScreenShield(layer: 0, alpha: 1, bounds: display, displays: [display]))
        precondition(!isFullScreenShield(layer: 1000, alpha: 0, bounds: display, displays: [display]))
        precondition(!isFullScreenShield(layer: 2000, alpha: 1, bounds: CGRect(x: 0, y: 0, width: 24, height: 24), displays: [display]))
        print("PASS: visual-service exclusions, normal-app/Finder compatibility and protected-session/shield guards")
    }
}

final class InteractionSafety {
    var onPause: (() -> Void)?
    private var locked = false, saver = false, awake = true, sessionActive = true
    private var cached = false, checkedAt = -Double.infinity
    private var workspaceTokens: [NSObjectProtocol] = [], distributedTokens: [NSObjectProtocol] = []
    func start() {
        guard workspaceTokens.isEmpty else { return }
        let workspace = NSWorkspace.shared.notificationCenter
        for (name, kind, value) in [(NSWorkspace.sessionDidResignActiveNotification, 0, false), (NSWorkspace.sessionDidBecomeActiveNotification, 0, true), (NSWorkspace.screensDidSleepNotification, 1, false), (NSWorkspace.screensDidWakeNotification, 1, true)] {
            workspaceTokens.append(workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }; if kind == 0 { self.sessionActive = value } else { self.awake = value }; self.invalidate()
            })
        }
        // Supplemental notifications; the native session/window probe is authoritative.
        for (name, kind, value) in [("com.apple.screenIsLocked", 0, true), ("com.apple.screenIsUnlocked", 0, false), ("com.apple.screensaver.didstart", 1, true), ("com.apple.screensaver.didstop", 1, false)] {
            distributedTokens.append(DistributedNotificationCenter.default().addObserver(forName: Notification.Name(name), object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }; if kind == 0 { self.locked = value } else { self.saver = value }; self.invalidate()
            })
        }
    }
    private func invalidate() { checkedAt = -Double.infinity; if !allowsAction(fresh: true) { onPause?() } }
    func allowsAction(fresh: Bool = false) -> Bool {
        let now = ProcessInfo.processInfo.systemUptime
        if !fresh && now - checkedAt < 0.1 { return cached }
        checkedAt = now; cached = false
        guard sessionActive, awake, let session = CGSessionCopyCurrentDictionary() as? [String: Any],
              WindowActionPolicy.flag(session[kCGSessionOnConsoleKey as String]) == true,
              WindowActionPolicy.flag(session[kCGSessionLoginDoneKey as String]) == true else { return false }
        let lockValue=session["CGSSessionScreenIsLocked"]
        if lockValue != nil && WindowActionPolicy.flag(lockValue)==nil { return false }
        let screenLocked = WindowActionPolicy.flag(lockValue) ?? locked
        guard WindowActionPolicy.canInteract(onConsole: true, loggedIn: true, locked: screenLocked, saver: saver, awake: awake) else { return false }
        if NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.ScreenSaver.Engine").contains(where: { !$0.isTerminated }) { return false }
        if let front=NSWorkspace.shared.frontmostApplication?.bundleIdentifier?.lowercased(), front.hasPrefix("com.apple.screensaver") || front.hasPrefix("com.apple.wallpaper") || front=="com.apple.loginwindow" { return false }
        let displays = NSScreen.screens.compactMap { screen -> CGRect? in
            guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return nil }
            return CGDisplayBounds(number.uint32Value)
        }
        guard !displays.isEmpty, let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return false }
        for window in windows {
            guard let layer = window[kCGWindowLayer as String] as? Int,
                  let raw = window[kCGWindowBounds as String] as? [String: Any], let bounds = CGRect(dictionaryRepresentation: raw as CFDictionary) else { continue }
            if WindowActionPolicy.isFullScreenShield(layer: layer, alpha: window[kCGWindowAlpha as String] as? Double ?? 0, bounds: bounds, displays: displays) { return false }
        }
        cached = true; return true
    }
    deinit {
        workspaceTokens.forEach { NSWorkspace.shared.notificationCenter.removeObserver($0) }
        distributedTokens.forEach { DistributedNotificationCenter.default().removeObserver($0) }
    }
}
