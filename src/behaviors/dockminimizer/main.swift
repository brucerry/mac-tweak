// Derived from Stoyanruh/DockMinimizer (MIT) and Bruce's local enhancements.
// See src/behaviors/NOTICE.md. Feature choices are read from a dedicated domain.
// DockMinimizer.swift
// A macOS menu bar app that minimizes the frontmost window when you
// click the already-active app's dock icon. Finder uses its real window state.
//
// === Compile ===
//   swiftc -o DockMinimizer DockMinimizer.swift
//
// === Run ===
//   ./DockMinimizer
//
// === Install as Login Item ===
//   1. Copy the binary somewhere permanent:
//        cp DockMinimizer /usr/local/bin/DockMinimizer
//   2. Create a LaunchAgent plist:
//        cp com.stoyan.dockminimizer.plist ~/Library/LaunchAgents/
//   3. Load it:
//        launchctl load ~/Library/LaunchAgents/com.stoyan.dockminimizer.plist
//   To unload:
//        launchctl unload ~/Library/LaunchAgents/com.stoyan.dockminimizer.plist
//
// === Test Instructions ===
//   1. Compile and run: swiftc -o DockMinimizer DockMinimizer.swift && ./DockMinimizer
//   2. Grant Accessibility permission when prompted (System Settings → Privacy & Security → Accessibility)
//   3. Relaunch after granting permission
//   4. Verify the menu bar icon appears (a small minimize icon)
//   5. Open any app (e.g. Finder, Safari, Terminal)
//   6. Click that app's dock icon while it's already the active/frontmost app
//   7. Its frontmost window should minimize to the dock
//   8. Test with multiple apps to confirm it works across different applications
//   9. Click the menu bar icon → Quit to stop
//
// === How It Works ===
//   - Installs a CGEvent tap (listen-only) to observe all left mouse clicks
//   - When a click lands on the Dock, checks if the clicked icon matches the frontmost app
//   - If it does (meaning the app was already active), minimizes its frontmost window
//   - Uses the Accessibility API for both element detection and window manipulation

import Cocoa
import ApplicationServices
import Darwin

// Translate only an Alt-Tab session; ordinary Option shortcuts are untouched.
struct AltTabGesture {
    struct Translation {
        let flags: CGEventFlags
        let keycode: Int64?
        let begins: Bool
    }
    private(set) var active = false

    mutating func reset() { active = false }

    mutating func translate(_ type: CGEventType, key: Int64, flags: CGEventFlags) -> Translation? {
        var begins = false
        if !active {
            guard type == .keyDown, key == 48, flags.contains(.maskAlternate),
                  flags.intersection([.maskCommand, .maskControl, .maskSecondaryFn]).isEmpty else { return nil }
            active = true
            begins = true
        }
        var translated = flags.subtracting(.maskAlternate)
        if flags.contains(.maskAlternate) { translated.insert(.maskCommand) }
        let keycode: Int64? = type == .flagsChanged && (key == 58 || key == 61) ? 55 : nil
        if type == .flagsChanged, !flags.contains(.maskAlternate) { active = false }
        return Translation(flags: translated, keycode: keycode, begins: begins)
    }
}

// Only a short, otherwise unused Control press counts as a launcher gesture.
// Events are observed, never consumed, so ordinary shortcuts remain intact.
struct KeyboardGestures {
    enum Action { case toggleApps, restoreWindow }
    private var controlDownAt: Double?
    private var commandTabPending = false

    mutating func reset() {
        controlDownAt = nil
        commandTabPending = false
    }

    mutating func process(_ type: CGEventType, key: Int64, flags: CGEventFlags, time: Double) -> Action? {
        let modifiers: CGEventFlags = [.maskCommand, .maskControl, .maskAlternate, .maskShift, .maskSecondaryFn]
        let active = flags.intersection(modifiers)
        if type == .keyDown {
            controlDownAt = nil
            if key == 48 && flags.contains(.maskCommand) { commandTabPending = true }
            if key == 53 { commandTabPending = false }
        } else if type == .flagsChanged {
            if commandTabPending && !flags.contains(.maskCommand) {
                commandTabPending = false
                controlDownAt = nil
                return .restoreWindow
            }
            if key == 59 || key == 62 {
                if active == .maskControl {
                    if controlDownAt == nil { controlDownAt = time }
                } else if active.isEmpty {
                    let started = controlDownAt
                    controlDownAt = nil
                    if let started, time - started <= 0.35 { return .toggleApps }
                } else {
                    controlDownAt = nil
                }
            } else {
                controlDownAt = nil
            }
        } else if [.leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel].contains(type) {
            controlDownAt = nil
        }
        return nil
    }
}

// MARK: - App Delegate

private func feature(_ key: String) -> Bool {
    let preferences = UserDefaults(suiteName: "org.macossetup.gestures")!
    return preferences.object(forKey: key) as? Bool ?? true
}

class DockMinimizer: NSObject, NSApplicationDelegate {
    static var shared: DockMinimizer!

    private var statusItem: NSStatusItem!
    var eventTap: CFMachPort?
    private var finderMouseTap: CFMachPort?
    private var altTabTap: CFMachPort?
    private var altTabGesture = AltTabGesture()
    private let syntheticKeyTag: Int64 = 0x446f636b4d696e69
    private var launcherClearGeneration = 0
    private var launcherResetWork: DispatchWorkItem?
    private var launcherHasUserInput = false
    private var lastLauncherInteraction = 0.0
    private var launcherGeometryStableSince = 0.0
    private var lastVisibleLauncherRect: CGRect?
    private var launcherVisibilityTimer: Timer?
    private var lastVisibleLauncherNumber: UInt32?
    private var launcherVisibilityInitialized = false
    private var lastLauncherVisibilitySample = 0.0
    private var lastRealKeyDownTime = 0.0
    private var lastRealKeyWasLauncherOpener = false
    private var dockPID: pid_t = -1
    private enum FinderAction { case minimize, restore }
    private struct FinderClick {
        let app: NSRunningApplication
        let dockItem: AXUIElement
        let window: AXUIElement
        let action: FinderAction
    }
    private var finderClick: FinderClick?

    private let interaction = InteractionSafety()
    private var permissionTimer: Timer?
    private var keyboardGestures = KeyboardGestures()

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let id = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: id).contains(where: { $0.processIdentifier != getpid() }) { NSApp.terminate(nil); return }
        interaction.start()
        interaction.onPause = { [weak self] in self?.cancelLauncherReset(); self?.keyboardGestures.reset(); self?.altTabGesture.reset(); self?.finderClick = nil }
        DockMinimizer.shared = self
        setupStatusItem()
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
        startWhenAuthorized()
        print("DockMinimizer access: Accessibility=\(AXIsProcessTrusted())"); fflush(stdout)
        permissionTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            self?.startWhenAuthorized()
        }
        launcherVisibilityTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.checkLauncherVisibility()
        }
    }

    private func startWhenAuthorized() {
        guard AXIsProcessTrusted() else { return }
        cacheDockPID()
        if eventTap == nil { setupEventTap() }
        if feature("minimizeEnabled"), finderMouseTap == nil { setupFinderMouseTap() }
        if feature("altTabEnabled"), altTabTap == nil { setupAltTabTap() }
        if eventTap != nil, (!feature("minimizeEnabled") || finderMouseTap != nil), (!feature("altTabEnabled") || altTabTap != nil) {
            statusItem.button?.toolTip = "Dock click to minimize • Alt+Tab to switch • Control tap for empty Apps search"
            statusItem.menu?.item(at: 0)?.title = "DockMinimizer Running"
        }
    }

    @objc private func openAccessibility() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Dock PID

    private func cacheDockPID() {
        if let dock = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.dock").first {
            dockPID = dock.processIdentifier
        }
    }

    // MARK: - Status Item

    private func makeIcon() -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor.controlTextColor.setStroke()
            // Small horizontal line near the bottom — the universal "minimize" symbol
            let path = NSBezierPath()
            path.lineWidth = 2.0
            path.lineCapStyle = .round
            path.move(to: NSPoint(x: 4, y: 4))
            path.line(to: NSPoint(x: 14, y: 4))
            path.stroke()
            return true
        }
        image.isTemplate = true  // Adapts to light/dark menu bar
        return image
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = makeIcon()
        }

        let menu = NSMenu()
        statusItem.button?.toolTip = "DockMinimizer needs Accessibility access"
        menu.addItem(withTitle: "Waiting for Accessibility Access", action: nil, keyEquivalent: "")
        let settingsItem = menu.addItem(withTitle: "Accessibility Settings…", action: #selector(openAccessibility), keyEquivalent: "")
        settingsItem.target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = menu
    }

    // MARK: - Event Tap

    private func setupAltTabTap() {
        let mask = [CGEventType.keyDown, .keyUp, .flagsChanged]
            .reduce(CGEventMask(0)) { $0 | (1 << $1.rawValue) }
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
            eventsOfInterest: mask, callback: { proxy, type, event, _ in
                DockMinimizer.shared.handleAltTab(proxy: proxy, type: type, event: event)
            }, userInfo: nil
        ) else { return }
        altTabTap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        print("Alt+Tab ready: eventTap=\(CGEvent.tapIsEnabled(tap: tap))")
        fflush(stdout)
    }

    private func handleAltTab(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            altTabGesture.reset()
            if let altTabTap { CGEvent.tapEnable(tap: altTabTap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        guard feature("altTabEnabled") || altTabGesture.active else { return Unmanaged.passUnretained(event) }
        guard event.getIntegerValueField(.eventSourceUserData) != syntheticKeyTag else { return Unmanaged.passUnretained(event) }
        let key = event.getIntegerValueField(.keyboardEventKeycode)
        guard interaction.allowsAction(fresh: true) else { altTabGesture.reset(); return Unmanaged.passUnretained(event) }
        guard let translation = altTabGesture.translate(type, key: key, flags: event.flags) else {
            return Unmanaged.passUnretained(event)
        }
        if translation.begins,
           let command = CGEvent(keyboardEventSource: CGEventSource(stateID: .privateState), virtualKey: 55, keyDown: true) {
            command.type = .flagsChanged
            command.flags = translation.flags
            command.setIntegerValueField(.eventSourceUserData, value: syntheticKeyTag)
            command.tapPostEvent(proxy)
        }
        event.flags = translation.flags
        if let keycode = translation.keycode { event.setIntegerValueField(.keyboardEventKeycode, value: keycode) }
        return Unmanaged.passUnretained(event)
    }

    // Keep keyboard observation passive. Only Finder's plain Dock clicks need
    // an active mouse filter, so their state is captured BEFORE Dock handles them.
    private func setupFinderMouseTap() {
        let mask = [CGEventType.leftMouseDown, .leftMouseUp, .leftMouseDragged]
            .reduce(CGEventMask(0)) { $0 | (1 << $1.rawValue) }
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
            eventsOfInterest: mask, callback: { _, type, event, _ in
                DockMinimizer.shared.handleFinderMouse(type: type, event: event)
            }, userInfo: nil
        ) else { return }
        finderMouseTap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        print("Finder Dock toggle ready: eventTap=\(CGEvent.tapIsEnabled(tap: tap))")
        fflush(stdout)
    }

    private func axValue(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }

    private func axElement(_ element: AXUIElement, _ name: String) -> AXUIElement? {
        guard let value = axValue(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
        return (value as! AXUIElement)
    }

    private func debugDock(_ message: @autoclosure () -> String) {
        guard UserDefaults.standard.bool(forKey: "dockDebug") else { return }
        print("Dock diagnostic: \(message())")
        fflush(stdout)
    }

    private func dockItemMatches(_ item: AXUIElement, app: NSRunningApplication) -> Bool {
        let urlMatch: Bool
        if let url = axValue(item, kAXURLAttribute) as? URL, let bundleURL = app.bundleURL {
            urlMatch = url.standardizedFileURL.path == bundleURL.standardizedFileURL.path
        } else { urlMatch = false }
        let titleMatch = axValue(item, kAXTitleAttribute) as? String == app.localizedName
        debugDock("item identity: urlMatch=\(urlMatch), titleMatch=\(titleMatch)")
        return urlMatch || titleMatch
    }

    private func finderDockItem(at point: CGPoint, finder: NSRunningApplication) -> AXUIElement? {
        cacheDockPID()
        let systemWide = AXUIElementCreateSystemWide()
        AXUIElementSetMessagingTimeout(systemWide, 0.05)
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(systemWide, Float(point.x), Float(point.y), &hit) == .success,
              var item = hit else { return nil }
        // An icon's image may be the hit element; use its application Dock item.
        for _ in 0..<3 {
            var pid: pid_t = 0
            guard AXUIElementGetPid(item, &pid) == .success, pid == dockPID else { return nil }
            debugDock("Dock hit subrole=\(axValue(item, kAXSubroleAttribute) as? String ?? "missing")")
            if axValue(item, kAXSubroleAttribute) as? String == kAXApplicationDockItemSubrole {
                return dockItemMatches(item, app: finder) ? item : nil
            }
            guard let parent = axElement(item, kAXParentAttribute) else { return nil }
            item = parent
        }
        return nil
    }

    private func finderWindows(_ app: AXUIElement) -> [AXUIElement] {
        let windows = axValue(app, kAXWindowsAttribute) as? [AXUIElement] ?? []
        debugDock("Finder window subroles=\(windows.map { axValue($0, kAXSubroleAttribute) as? String ?? "missing" })")
        return windows.filter {
            let standard = axValue($0, kAXSubroleAttribute) as? String == kAXStandardWindowSubrole
            // Finder may expose a minimized browser window as AXDialog.
            let minimized = axValue($0, kAXMinimizedAttribute) as? Bool == true
                && axElement($0, kAXMinimizeButtonAttribute) != nil
            return (standard || minimized) && axValue($0, kAXModalAttribute) as? Bool != true
        }
    }

    private func finderWindowIsInFront(_ window: AXUIElement, app: NSRunningApplication) -> Bool {
        let active = NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier
        guard active else { debugDock("Finder not active"); return false }
        guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
                as? [[String: Any]],
              let top = windows.first(where: {
                  ($0[kCGWindowLayer as String] as? Int) == 0
                      && ($0[kCGWindowAlpha as String] as? Double ?? 0) > 0
              }) else { debugDock("No onscreen normal window metadata"); return false }
        let inFront = (top[kCGWindowOwnerPID as String] as? Int) == Int(app.processIdentifier)
        debugDock("Finder front normal window=\(inFront)")
        return inFront
    }

    private func handleFinderMouse(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            finderClick = nil
            if let finderMouseTap { CGEvent.tapEnable(tap: finderMouseTap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        guard interaction.allowsAction() else { finderClick = nil; return Unmanaged.passUnretained(event) }
        let modifiers: CGEventFlags = [.maskCommand, .maskControl, .maskAlternate, .maskShift]
        if type == .leftMouseUp, let click = finderClick {
            finderClick = nil
            // Releasing outside the original icon cancels the click. Never
            // look up "the first window" after Dock may have changed it.
            if event.flags.intersection(modifiers).isEmpty,
               let releasedItem = finderDockItem(at: event.location, finder: click.app),
               CFEqual(releasedItem, click.dockItem) {
                DispatchQueue.main.async { [weak self] in self?.performFinderClick(click) }
            }
            return nil
        }
        if type == .leftMouseDragged, finderClick != nil { return nil }
        guard type == .leftMouseDown else { return Unmanaged.passUnretained(event) }
        if feature("clearSearchEnabled") { handleLauncherMouseDown(event) }
        guard feature("minimizeEnabled") else { return Unmanaged.passUnretained(event) }
        debugDock("active mouseDown")
        finderClick = nil
        guard event.flags.intersection(modifiers).isEmpty,
              let finder = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first,
              let item = finderDockItem(at: event.location, finder: finder) else { return Unmanaged.passUnretained(event) }
        let app = AXUIElementCreateApplication(finder.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 0.05)
        let windows = finderWindows(app)
        let visible = windows.filter { axValue($0, kAXMinimizedAttribute) as? Bool == false }
        debugDock("Finder recognized: standard=\(windows.count), visible=\(visible.count)")
        let target: AXUIElement
        let action: FinderAction
        if visible.isEmpty {
            // No real windows: let Finder open one. If one is minimized,
            // restore that exact window instead of asking Finder to reopen.
            guard let minimized = windows.first(where: { axValue($0, kAXMinimizedAttribute) as? Bool == true })
                else { return Unmanaged.passUnretained(event) }
            target = minimized
            action = .restore
        } else {
            // Background window or desktop focus: native Dock activation.
            let focused = axElement(app, kAXFocusedWindowAttribute) ?? axElement(app, kAXMainWindowAttribute)
            debugDock("Finder focus available=\(focused != nil)")
            if let focused {
                let minimize = axElement(focused, kAXMinimizeButtonAttribute)
                debugDock("Finder focused visible=\(visible.contains(where: { CFEqual($0, focused) })), minimize enabled=\(minimize.flatMap { axValue($0, kAXEnabledAttribute) as? Bool } ?? false)")
            }
            guard let focused,
                  visible.contains(where: { CFEqual($0, focused) }),
                  finderWindowIsInFront(focused, app: finder),
                  let minimize = axElement(focused, kAXMinimizeButtonAttribute),
                  axValue(minimize, kAXEnabledAttribute) as? Bool == true
                else { return Unmanaged.passUnretained(event) }
            target = focused
            action = .minimize
        }
        finderClick = FinderClick(app: finder, dockItem: item, window: target, action: action)
        debugDock("Finder click captured: \(action)")
        keyboardGestures.reset()
        return nil
    }

    private func performFinderClick(_ click: FinderClick) {
        debugDock("perform Finder \(click.action)")
        guard interaction.allowsAction(fresh: true), WindowActionPolicy.allows(click.app, allowFinder: true) else { return }
        let app = AXUIElementCreateApplication(click.app.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 0.05)
        guard finderWindows(app).contains(where: { CFEqual($0, click.window) }) else { return }
        switch click.action {
        case .minimize:
            guard axValue(click.window, kAXMinimizedAttribute) as? Bool == false,
                  let focused = axElement(app, kAXFocusedWindowAttribute) ?? axElement(app, kAXMainWindowAttribute),
                  CFEqual(focused, click.window),
                  finderWindowIsInFront(click.window, app: click.app) else { return }
            guard interaction.allowsAction(fresh: true) else { return }
            let result = AXUIElementSetAttributeValue(click.window, kAXMinimizedAttribute as CFString, kCFBooleanTrue)
            debugDock("Finder minimize result=\(result.rawValue)")
        case .restore:
            guard axValue(click.window, kAXMinimizedAttribute) as? Bool == true else { return }
            guard interaction.allowsAction(fresh: true) else { return }
            if AXUIElementSetAttributeValue(click.window, kAXMinimizedAttribute as CFString, kCFBooleanFalse) == .success {
                guard interaction.allowsAction(fresh: true) else { return }
                click.app.activate(options: [])
                AXUIElementPerformAction(click.window, kAXRaiseAction as CFString)
            }
        }
    }

    private func setupEventTap() {
        let observed: [CGEventType] = [.leftMouseDown, .rightMouseDown, .otherMouseDown, .scrollWheel, .keyDown, .flagsChanged]
        let eventMask = observed.reduce(CGEventMask(0)) { $0 | (1 << $1.rawValue) }

        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: eventMask,
            callback: eventTapCallback,
            userInfo: nil
        ) else {
            print("Error: Failed to create event tap. Is Accessibility granted?")
            return
        }

        eventTap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        print("DockMinimizer ready: Accessibility=\(AXIsProcessTrusted()), eventTap=\(CGEvent.tapIsEnabled(tap: tap))")
        fflush(stdout)
    }

    func resetKeyboardGestures() { keyboardGestures.reset() }

    func handleInput(type: CGEventType, event: CGEvent) {
        guard interaction.allowsAction() else { cancelLauncherReset(); keyboardGestures.reset(); return }
        // Stop any pending search clear as soon as the user starts typing.
        if type == .keyDown, event.getIntegerValueField(.eventSourceUserData) != syntheticKeyTag {
            cancelLauncherReset()
            lastRealKeyDownTime = ProcessInfo.processInfo.systemUptime
            lastRealKeyWasLauncherOpener = event.getIntegerValueField(.keyboardEventKeycode) == 49
                && event.flags.contains(.maskCommand)
            if !lastRealKeyWasLauncherOpener { launcherHasUserInput = true }
        }
        let action = keyboardGestures.process(type, key: event.getIntegerValueField(.keyboardEventKeycode),
                                             flags: event.flags, time: ProcessInfo.processInfo.systemUptime)
        switch action {
        case .toggleApps:
            guard feature("launcherEnabled") else { return }
            cancelLauncherReset()
            launcherHasUserInput = false
            lastLauncherInteraction = ProcessInfo.processInfo.systemUptime
            let generation = launcherClearGeneration
            DispatchQueue.main.async { [weak self] in
                guard let self, self.interaction.allowsAction(fresh: true) else { return }
                // Only the explicit shortcut toggles Apps. Search-reset work never toggles it.
                let configuration = NSWorkspace.OpenConfiguration()
                configuration.activates = true
                NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: "/System/Applications/Apps.app"),
                                                   configuration: configuration) { _, error in
                    if let error { NSLog("Could not toggle Apps: %@", error.localizedDescription) }
                    else {
                        DispatchQueue.main.async {
                            guard self.launcherClearGeneration == generation else { return }
                            self.queueLauncherReset()
                        }
                    }
                }
            }
        case .restoreWindow:
            guard feature("altTabEnabled") else { return }
            // Wait for the built-in switcher to finish activating its selection.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in
                self?.restoreMinimizedWindow()
            }
        case nil: break
        }
    }

    private func visibleWindows() -> [[String: Any]] {
        CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
            as? [[String: Any]] ?? []
    }

    private func cancelLauncherReset() {
        launcherClearGeneration += 1
        launcherResetWork?.cancel()
        launcherResetWork = nil
    }

    private func queueLauncherReset() {
        cancelLauncherReset()
        let generation = launcherClearGeneration
        scheduleLauncherReset(generation: generation, attempt: 0)
    }

    private func scheduleLauncherReset(generation: Int, attempt: Int) {
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.interaction.allowsAction(fresh: true), self.launcherClearGeneration == generation, !self.launcherHasUserInput,
                  let panel = self.launcherPanel(requireOpaque: true) else { return }
            let now = ProcessInfo.processInfo.systemUptime
            guard now - self.lastLauncherInteraction >= 0.18,
                  now - self.launcherGeometryStableSince >= 0.18,
                  panel.number == self.lastVisibleLauncherNumber,
                  panel.rect == self.lastVisibleLauncherRect else {
                if attempt < 12 { self.scheduleLauncherReset(generation: generation, attempt: attempt + 1) }
                return
            }
            self.launcherResetWork = nil
            _ = self.clearPanelField(pid: panel.pid, rect: panel.rect)
        }
        launcherResetWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: work)
    }

    private func checkLauncherVisibility() {
        guard interaction.allowsAction() else { cancelLauncherReset(); return }
        guard feature("clearSearchEnabled") else { return }
        guard AXIsProcessTrusted() else { return }
        let now = ProcessInfo.processInfo.systemUptime
        let panel = launcherPanel()
        defer {
            lastVisibleLauncherNumber = panel?.number
            lastVisibleLauncherRect = panel?.rect
            lastLauncherVisibilitySample = now
            launcherVisibilityInitialized = true
        }
        guard launcherVisibilityInitialized else { return }
        guard let panel else {
            if lastVisibleLauncherNumber != nil { cancelLauncherReset() }
            launcherHasUserInput = false
            return
        }
        let appeared = lastVisibleLauncherNumber == nil
        let changed = panel.number != lastVisibleLauncherNumber || panel.rect != lastVisibleLauncherRect
        if changed { launcherGeometryStableSince = now }
        if appeared {
            launcherHasUserInput = lastRealKeyDownTime > lastLauncherVisibilitySample && !lastRealKeyWasLauncherOpener
        }
        if (appeared || changed), !launcherHasUserInput { queueLauncherReset() }
    }

    private func isAppsDockIcon(at point: CGPoint) -> Bool {
        cacheDockPID()
        let root = AXUIElementCreateSystemWide()
        AXUIElementSetMessagingTimeout(root, 0.05)
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(root, Float(point.x), Float(point.y), &hit) == .success,
              var item = hit else { return false }
        for _ in 0..<3 {
            var pid: pid_t = 0
            guard AXUIElementGetPid(item, &pid) == .success, pid == dockPID else { return false }
            if axValue(item, kAXSubroleAttribute) as? String == kAXApplicationDockItemSubrole {
                if (axValue(item, kAXURLAttribute) as? URL)?.standardizedFileURL.path == "/System/Applications/Apps.app" { return true }
                let title = axValue(item, kAXTitleAttribute) as? String ?? ""
                return ["Apps", "應用程式", "应用程序"].contains(title)
            }
            guard let parent = axElement(item, kAXParentAttribute) else { return false }
            item = parent
        }
        return false
    }

    private func handleLauncherMouseDown(_ event: CGEvent) {
        cancelLauncherReset()
        lastLauncherInteraction = ProcessInfo.processInfo.systemUptime
        if let panel = launcherPanel() {
            if panel.rect.contains(event.location) {
                launcherHasUserInput = true
            } else {
                // The click may dismiss or quickly reopen the native panel. Wait
                // until it settles; do not write into a closing or hidden field.
                launcherHasUserInput = false
                queueLauncherReset()
            }
            return
        }
        let modifiers: CGEventFlags = [.maskCommand, .maskControl, .maskAlternate, .maskShift]
        guard event.flags.intersection(modifiers).isEmpty, isAppsDockIcon(at: event.location) else { return }
        launcherHasUserInput = false
        queueLauncherReset()
    }

    private func launcherPanel(requireOpaque: Bool = false) -> (pid: pid_t, number: UInt32, rect: CGRect)? {
        for window in visibleWindows() {
            guard let number = window[kCGWindowNumber as String] as? UInt32,
                  let pid = window[kCGWindowOwnerPID as String] as? Int,
                  (window[kCGWindowLayer as String] as? Int ?? 0) > 0,
                  (window[kCGWindowAlpha as String] as? Double ?? 0) >= (requireOpaque ? 0.99 : 0.01),
                  let bounds = window[kCGWindowBounds as String] as? [String: Any],
                  let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary),
                  rect.width > 280, rect.height > 40 else { continue }
            var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
            guard proc_pidpath(pid_t(pid), &buffer, UInt32(buffer.count)) > 0,
                  String(cString: buffer).hasPrefix("/System/Applications/Siri AI.app/") else { continue }
            return (pid_t(pid), number, rect)
        }
        return nil
    }

    private func clearPanelField(pid: pid_t, rect: CGRect) -> Bool {
        guard interaction.allowsAction(fresh: true) else { return false }
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(app, 0.05)
        let windows = axValue(app, kAXWindowsAttribute) as? [AXUIElement] ?? []
        for window in windows {
            guard let rawPosition = axValue(window, kAXPositionAttribute),
                  CFGetTypeID(rawPosition) == AXValueGetTypeID(),
                  let rawSize = axValue(window, kAXSizeAttribute), CFGetTypeID(rawSize) == AXValueGetTypeID() else { continue }
            var point = CGPoint.zero
            var size = CGSize.zero
            guard AXValueGetValue(rawPosition as! AXValue, .cgPoint, &point),
                  AXValueGetValue(rawSize as! AXValue, .cgSize, &size),
                  abs(point.x - rect.minX) < 5, abs(point.y - rect.minY) < 5,
                  abs(size.width - rect.width) < 5, abs(size.height - rect.height) < 5 else { continue }
            var nodes = [window]
            var index = 0
            while index < nodes.count && index < 100 {
                let node = nodes[index]
                index += 1
                let role = axValue(node, kAXRoleAttribute) as? String ?? ""
                if role == kAXTextFieldRole || role == kAXComboBoxRole || role == kAXTextAreaRole {
                    if axValue(node, kAXValueAttribute) as? String == "" { return true }
                    guard interaction.allowsAction(fresh: true) else { return false }
                    if AXUIElementSetAttributeValue(node, kAXValueAttribute as CFString, "" as CFString) == .success {
                        print("Launcher panel search field cleared")
                        fflush(stdout)
                        return true
                    }
                }
                nodes.append(contentsOf: axValue(node, kAXChildrenAttribute) as? [AXUIElement] ?? [])
            }
        }
        return false
    }

    private func restoreMinimizedWindow() {
        guard let front = NSWorkspace.shared.frontmostApplication,
              interaction.allowsAction(fresh: true), WindowActionPolicy.allows(front),
              !hasVisibleWindows(pid: front.processIdentifier) else { return }
        let element = AXUIElementCreateApplication(front.processIdentifier)
        AXUIElementSetMessagingTimeout(element, 0.3)
        var value: AnyObject?
        guard AXUIElementCopyAttributeValue(element, kAXWindowsAttribute as CFString, &value) == .success,
              let windows = value as? [AXUIElement] else { return }
        for window in windows {
            var minimized: AnyObject?
            guard AXUIElementCopyAttributeValue(window, kAXMinimizedAttribute as CFString, &minimized) == .success,
                  minimized as? Bool == true else { continue }
            guard interaction.allowsAction(fresh: true) else { return }
            if AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanFalse) == .success {
                guard interaction.allowsAction(fresh: true) else { return }
                AXUIElementPerformAction(window, kAXRaiseAction as CFString)
                return
            }
        }
    }

    // MARK: - Click Handling

    func handleClick(at point: CGPoint) {
        debugDock("passive mouseDown")
        cacheDockPID()
        guard interaction.allowsAction(), dockPID > 0 else { return }


        // Find the AX element at the click position
        let systemWide = AXUIElementCreateSystemWide()
        var elementRef: AXUIElement?
        guard AXUIElementCopyElementAtPosition(systemWide, Float(point.x), Float(point.y), &elementRef) == .success,
              let element = elementRef else {
            return
        }

        // Verify the element belongs to the Dock
        var pid: pid_t = 0
        AXUIElementGetPid(element, &pid)
        guard pid == dockPID else { return }

        // Apps must retain its native toggle behavior, including rapid reopen.
        guard !isAppsDockIcon(at: point) else { return }

        // Match app identity even when the Dock and localizedName use different languages.
        guard let frontApp = NSWorkspace.shared.frontmostApplication,
              // Finder is handled before Dock processes the click, by its mouse filter.
              WindowActionPolicy.allows(frontApp), frontApp.bundleIdentifier != "com.apple.finder",
              dockItemMatches(element, app: frontApp) else {
            return
        }

        if frontApp.bundleIdentifier == "com.apple.campo", launcherPanel() != nil { return }

        let frontPID = frontApp.processIdentifier
        let appElement = AXUIElementCreateApplication(frontPID)
        AXUIElementSetMessagingTimeout(appElement, 0.1)
        guard let target = axElement(appElement, kAXFocusedWindowAttribute)
                ?? axElement(appElement, kAXMainWindowAttribute),
              axValue(target, kAXMinimizedAttribute) as? Bool != true else { return }
        debugDock("generic target selected for \(frontApp.bundleIdentifier ?? "unknown")")

        // Check if the app has any visible (non-minimized) windows RIGHT NOW,
        // before macOS processes the click. If all windows are minimized,
        // the user is clicking to restore — don't minimize.
        let visible = hasVisibleWindows(pid: frontPID)
        debugDock("generic app matched, visible=\(visible)")
        guard visible else { return }

        // Delay slightly so the system processes the click first,
        // then verify the same app is still frontmost (no app switch happened)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            guard self.interaction.allowsAction(fresh: true), let currentFront = NSWorkspace.shared.frontmostApplication,
                  currentFront.processIdentifier == frontPID else {
                return
            }
            self.minimizeWindow(target)
            self.debugDock("generic minimize requested")
        }
    }

    // MARK: - Window State

    private func hasVisibleWindows(pid: pid_t) -> Bool {
        let appElement = AXUIElementCreateApplication(pid)
        var windowsRef: AnyObject?
        AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef)
        guard let windows = windowsRef as? [AXUIElement] else { return false }

        for window in windows {
            var minimizedRef: AnyObject?
            AXUIElementCopyAttributeValue(window, kAXMinimizedAttribute as CFString, &minimizedRef)
            if let isMinimized = minimizedRef as? Bool, !isMinimized {
                return true
            }
        }
        return false
    }

    // MARK: - Minimize

    private func minimizeWindow(_ window: AXUIElement) {
        guard interaction.allowsAction(fresh: true) else { return }
        guard axValue(window, kAXMinimizedAttribute) as? Bool != true else { return }
        if let button = axElement(window, kAXMinimizeButtonAttribute),
           axValue(button, kAXEnabledAttribute) as? Bool == true {
            guard interaction.allowsAction(fresh: true) else { return }
            let pressed = AXUIElementPerformAction(button, kAXPressAction as CFString)
            debugDock("minimize button result=\(pressed.rawValue)")
            if pressed == .success { return }
        }
        guard interaction.allowsAction(fresh: true) else { return }
        let result = AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanTrue)
        debugDock("minimize attribute result=\(result.rawValue)")
    }
}

// MARK: - CGEvent Tap Callback (C-compatible free function)

func eventTapCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    userInfo: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    // Re-enable the tap if macOS disabled it due to timeout
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        DockMinimizer.shared?.resetKeyboardGestures()
        if let tap = DockMinimizer.shared?.eventTap {
            CGEvent.tapEnable(tap: tap, enable: true)
        }
        return Unmanaged.passUnretained(event)
    }

    DockMinimizer.shared?.handleInput(type: type, event: event)
    guard type == .leftMouseDown else { return Unmanaged.passUnretained(event) }
    let modifiers: CGEventFlags = [.maskCommand, .maskControl, .maskAlternate, .maskShift]
    guard event.flags.intersection(modifiers).isEmpty else {
        return Unmanaged.passUnretained(event)
    }
    if feature("minimizeEnabled") { DockMinimizer.shared?.handleClick(at: event.location) }
    return Unmanaged.passUnretained(event)
}

// MARK: - Entry Point

if CommandLine.arguments.contains("--self-test") {
    WindowActionPolicy.selfTest()
    var alt = AltTabGesture()
    assert(alt.translate(.flagsChanged, key: 58, flags: .maskAlternate) == nil)
    assert(alt.translate(.keyDown, key: 8, flags: .maskAlternate) == nil)
    let start = alt.translate(.keyDown, key: 48, flags: .maskAlternate)
    assert(start?.begins == true && start?.flags == .maskCommand)
    assert(alt.translate(.keyUp, key: 48, flags: .maskAlternate)?.flags == .maskCommand)
    let reverse = alt.translate(.keyDown, key: 48, flags: [.maskAlternate, .maskShift])
    assert(reverse?.begins == false && reverse?.flags == [.maskCommand, .maskShift])
    let released = alt.translate(.flagsChanged, key: 58, flags: [])
    assert(released?.keycode == 55 && released?.flags == [] && !alt.active)
    assert(alt.translate(.keyDown, key: 48, flags: .maskCommand) == nil)
    assert(alt.translate(.keyDown, key: 48, flags: [.maskAlternate, .maskControl]) == nil)
    assert(alt.translate(.keyDown, key: 48, flags: [.maskAlternate, .maskShift])?.flags == [.maskCommand, .maskShift])
    assert(alt.translate(.keyDown, key: 53, flags: .maskAlternate)?.flags == .maskCommand)
    assert(alt.translate(.flagsChanged, key: 61, flags: [])?.keycode == 55)
    print("Passed: Alt-Tab forward/reverse, repeats, both Alt releases, Escape, ordinary Option and native Command shortcuts")
    var g = KeyboardGestures()
    func send(_ type: CGEventType, _ key: Int64, _ flags: CGEventFlags, _ time: Double) -> KeyboardGestures.Action? {
        g.process(type, key: key, flags: flags, time: time)
    }
    assert(send(.flagsChanged, 59, .maskControl, 1) == nil)
    assert(send(.flagsChanged, 59, [], 1.1) == .toggleApps)
    _ = send(.flagsChanged, 62, .maskControl, 2)
    assert(send(.flagsChanged, 62, [], 2.5) == nil)
    _ = send(.flagsChanged, 59, .maskControl, 3)
    _ = send(.keyDown, 8, .maskControl, 3.05)
    assert(send(.flagsChanged, 59, [], 3.1) == nil)
    _ = send(.flagsChanged, 59, .maskControl, 4)
    _ = send(.rightMouseDown, 0, .maskControl, 4.05)
    assert(send(.flagsChanged, 59, [], 4.1) == nil)
    _ = send(.flagsChanged, 59, .maskControl, 5)
    _ = send(.flagsChanged, 56, [.maskControl, .maskShift], 5.05)
    assert(send(.flagsChanged, 59, [], 5.1) == nil)
    _ = send(.keyDown, 48, .maskCommand, 6)
    assert(send(.flagsChanged, 55, [], 6.1) == .restoreWindow)
    _ = send(.keyDown, 48, [.maskCommand, .maskShift], 7)
    assert(send(.flagsChanged, 55, [], 7.1) == .restoreWindow)
    _ = send(.keyDown, 48, .maskCommand, 8)
    _ = send(.keyDown, 53, .maskCommand, 8.05)
    assert(send(.flagsChanged, 55, [], 8.1) == nil)
    print("Passed: Control tap, hold, shortcuts, click, modifiers; Command-Tab, reverse, Escape cancellation")
    exit(0)
}

let app = NSApplication.shared
let delegate = DockMinimizer()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
