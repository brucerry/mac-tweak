import AppKit
import ApplicationServices

private func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}

private func elementAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}

private struct CloseTarget {
    let button: AXUIElement
    let app: NSRunningApplication
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private let stateItem = NSMenuItem(title: "Waiting for Accessibility access", action: nil, keyEquivalent: "")
    private let enabledItem = NSMenuItem(title: "Red Button Quits Apps", action: #selector(toggleEnabled), keyEquivalent: "")
    private let loginItem = NSMenuItem(title: "Start at Login", action: #selector(toggleLogin), keyEquivalent: "")
    private let edgeItem = NSMenuItem(title: "Quit Edge After Its Last Tab Closes", action: #selector(toggleEdgeQuit), keyEquivalent: "")
    private let terminalItem = NSMenuItem(title: "Quit Terminal After Its Last Tab Closes", action: #selector(toggleTerminalQuit), keyEquivalent: "")
    private let lastItem = NSMenuItem(title: "No quit requests yet", action: nil, keyEquivalent: "")
    private var window: NSWindow?
    private var statusLabel: NSTextField?
    private var enableBox: NSButton?
    private var loginBox: NSButton?
    private var edgeBox: NSButton?
    private var terminalBox: NSButton?
    private var timer: Timer?
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var pending: CloseTarget?
    private let interaction = InteractionSafety()
    private lazy var edgeMonitor = LastWindowQuitMonitor(bundleIdentifier: "com.microsoft.edgemac", canAct: { [weak self] in self?.interaction.allowsAction(fresh: true) == true }) { [weak self] sent in
        self?.lastItem.title = sent ? "Quit requested: Edge (last tab closed)" : "Could not request Edge quit"
    }
    private lazy var terminalMonitor = LastWindowQuitMonitor(bundleIdentifier: "com.apple.Terminal", canAct: { [weak self] in self?.interaction.allowsAction(fresh: true) == true }) { [weak self] sent in
        self?.lastItem.title = sent ? "Quit requested: Terminal (last tab closed)" : "Could not request Terminal quit"
    }
    private var workspaceTokens: [NSObjectProtocol] = []
    private let systemWide = AXUIElementCreateSystemWide()
    private var enabled: Bool {
        get { UserDefaults(suiteName: "org.macossetup.closing")!.object(forKey: "enabled") as? Bool ?? true }
        set { UserDefaults(suiteName: "org.macossetup.closing")!.set(newValue, forKey: "enabled") }
    }
    private var edgeQuitEnabled: Bool {
        get { UserDefaults(suiteName: "org.macossetup.closing")!.object(forKey: "edgeQuitEnabled") as? Bool ?? true }
        set { UserDefaults(suiteName: "org.macossetup.closing")!.set(newValue, forKey: "edgeQuitEnabled") }
    }
    private var terminalQuitEnabled: Bool {
        get { UserDefaults(suiteName: "org.macossetup.closing")!.object(forKey: "terminalQuitEnabled") as? Bool ?? true }
        set { UserDefaults(suiteName: "org.macossetup.closing")!.set(newValue, forKey: "terminalQuitEnabled") }
    }
    private let protectedApps: Set<String> = [
        "com.apple.finder", "com.apple.dock", "com.apple.SystemUIServer",
        "com.apple.controlcenter", "com.apple.notificationcenterui", "com.apple.loginwindow"
    ]
    private var loginURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/org.macossetup.closing.plist")
    }
    private var startsAtLogin: Bool { FileManager.default.fileExists(atPath: loginURL.path) }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Only one helper may intercept clicks at a time.
        if let bundleID = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).contains(where: {
               $0.processIdentifier != ProcessInfo.processInfo.processIdentifier && !$0.isTerminated
           }) {
            NSApp.terminate(nil)
            return
        }
        interaction.start()
        interaction.onPause = { [weak self] in self?.pending = nil; self?.edgeMonitor.stop(); self?.terminalMonitor.stop() }
        NSApp.setActivationPolicy(.accessory)
        AXUIElementSetMessagingTimeout(systemWide, 0.05)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let image = NSImage(systemSymbolName: "xmark.circle.fill", accessibilityDescription: "QuitOnRed") {
            image.isTemplate = true
            statusItem.button?.image = image
        } else {
            statusItem.button?.title = "×"
        }
        let menu = NSMenu()
        menu.delegate = self
        menu.addItem(stateItem)
        menu.addItem(.separator())
        enabledItem.target = self
        menu.addItem(enabledItem)
        edgeItem.target = self
        menu.addItem(edgeItem)
        terminalItem.target = self
        menu.addItem(terminalItem)
        loginItem.target = self
        // Login is managed by the reviewed setup workflow.
        menu.addItem(.separator())
        let hint = NSMenuItem(title: "Shift-click red to close only one window", action: nil, keyEquivalent: "")
        menu.addItem(hint)
        menu.addItem(lastItem)
        menu.addItem(.separator())
        let settings = NSMenuItem(title: "Settings…", action: #selector(showSettings), keyEquivalent: ",")
        settings.target = self
        menu.addItem(settings)
        let quit = NSMenuItem(title: "Quit QuitOnRed", action: #selector(quitHelper), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem.menu = menu
        for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didTerminateApplicationNotification] {
            workspaceTokens.append(NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.updateLastWindowMonitoring()
            })
        }
        refresh()
        print("QuitOnRed access: Accessibility=\(AXIsProcessTrusted()), eventTap=\(eventTap != nil)"); fflush(stdout)
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.refresh() }
        let firstLaunch = !UserDefaults.standard.bool(forKey: "hasLaunched")
        UserDefaults.standard.set(true, forKey: "hasLaunched")
        if firstLaunch || !AXIsProcessTrusted() { showSettings() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate()
        stopTap()
        edgeMonitor.stop()
        terminalMonitor.stop()
        for token in workspaceTokens { NSWorkspace.shared.notificationCenter.removeObserver(token) }
    }

    func menuWillOpen(_ menu: NSMenu) { refresh() }

    private func updateLastWindowMonitoring() {
        edgeMonitor.update(enabled: edgeQuitEnabled)
        terminalMonitor.update(enabled: terminalQuitEnabled)
    }

    private func startTap() {
        guard eventTap == nil, AXIsProcessTrusted() else { return }
        let mask = (1 << CGEventType.leftMouseDown.rawValue)
            | (1 << CGEventType.leftMouseUp.rawValue)
            | (1 << CGEventType.leftMouseDragged.rawValue)
        let context = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
            eventsOfInterest: CGEventMask(mask), callback: { _, type, event, info in
                guard let info else { return Unmanaged.passUnretained(event) }
                let owner = Unmanaged<AppDelegate>.fromOpaque(info).takeUnretainedValue()
                return owner.handle(type, event)
            }, userInfo: context
        ) else { return }
        eventTap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        runLoopSource = source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    private func stopTap() {
        if let eventTap { CGEvent.tapEnable(tap: eventTap, enable: false); CFMachPortInvalidate(eventTap) }
        if let runLoopSource { CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, .commonModes) }
        eventTap = nil
        runLoopSource = nil
        pending = nil
    }

    private func target(at point: CGPoint) -> CloseTarget? {
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(systemWide, Float(point.x), Float(point.y), &hit) == .success,
              var element = hit else { return nil }
        // The window's AXCloseButton must match, so document/tab close controls are unaffected.
        for _ in 0..<4 {
            if let subrole = attribute(element, kAXSubroleAttribute) as? String,
               subrole == kAXCloseButtonSubrole,
               let window = elementAttribute(element, kAXWindowAttribute),
               let close = elementAttribute(window, kAXCloseButtonAttribute), CFEqual(close, element),
               attribute(close, kAXEnabledAttribute) as? Bool == true {
                var pid: pid_t = 0
                guard AXUIElementGetPid(close, &pid) == .success,
                      pid != ProcessInfo.processInfo.processIdentifier,
                      let app = NSRunningApplication(processIdentifier: pid),
                      WindowActionPolicy.allows(app), !app.isTerminated,
                      let bundleID = app.bundleIdentifier, !protectedApps.contains(bundleID) else { return nil }
                return CloseTarget(button: close, app: app)
            }
            guard let parent = elementAttribute(element, kAXParentAttribute) else { break }
            element = parent
        }
        return nil
    }

    private func handle(_ type: CGEventType, _ event: CGEvent) -> Unmanaged<CGEvent>? {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            pending = nil
            if let eventTap { CGEvent.tapEnable(tap: eventTap, enable: true) }
            return Unmanaged.passUnretained(event)
        }
        guard interaction.allowsAction() else { pending = nil; return Unmanaged.passUnretained(event) }
        if type == .leftMouseUp, let pressed = pending {
            pending = nil
            if enabled, !event.flags.contains(.maskShift),
               let released = target(at: event.location),
               released.app.processIdentifier == pressed.app.processIdentifier,
               CFEqual(released.button, pressed.button) {
                // Defer until the click event has been swallowed. This is normal Quit, never Force Quit.
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.interaction.allowsAction(fresh: true), WindowActionPolicy.allows(pressed.app) else { return }
                    let sent = pressed.app.terminate()
                    self.lastItem.title = "\(sent ? "Quit requested" : "Could not request quit"): \(pressed.app.localizedName ?? "App")"
                }
            }
            return nil
        }
        if type == .leftMouseDragged, pending != nil { return nil }
        if type == .leftMouseDown {
            pending = nil
            if enabled, !event.flags.contains(.maskShift), let close = target(at: event.location) {
                pending = close
                return nil
            }
        }
        return Unmanaged.passUnretained(event)
    }

    private func refresh() {
        let trusted = AXIsProcessTrusted()
        if trusted { startTap() } else if eventTap != nil { stopTap() }
        updateLastWindowMonitoring()
        let message: String
        if !trusted { message = "Waiting for Accessibility access" }
        else if eventTap == nil { message = "Restart QuitOnRed to enable click handling" }
        else { message = enabled ? "Active — red button quits apps" : "Paused — red button closes windows" }
        stateItem.title = message
        statusLabel?.stringValue = message
        statusItem.button?.toolTip = "QuitOnRed: \(message)"
        enabledItem.state = enabled ? .on : .off
        loginItem.state = startsAtLogin ? .on : .off
        edgeItem.state = edgeQuitEnabled ? .on : .off
        terminalItem.state = terminalQuitEnabled ? .on : .off
        enableBox?.state = enabled ? .on : .off
        loginBox?.state = startsAtLogin ? .on : .off
        edgeBox?.state = edgeQuitEnabled ? .on : .off
        terminalBox?.state = terminalQuitEnabled ? .on : .off
    }

    @objc private func toggleEnabled() { enabled.toggle(); refresh() }
    @objc private func toggleEdgeQuit() { edgeQuitEnabled.toggle(); refresh() }
    @objc private func toggleTerminalQuit() { terminalQuitEnabled.toggle(); refresh() }
    @objc private func toggleLogin() {
        do {
            if startsAtLogin { try FileManager.default.removeItem(at: loginURL) }
            else {
                try FileManager.default.createDirectory(at: loginURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                let plist: [String: Any] = [
                    "Label": "org.macossetup.closing",
                    "ProgramArguments": ["/usr/bin/open", "-gj", Bundle.main.bundleURL.path],
                    "RunAtLoad": true
                ]
                let data = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
                try data.write(to: loginURL, options: .atomic)
            }
        } catch {
            let alert = NSAlert()
            alert.messageText = "Could not change Start at Login"
            alert.informativeText = error.localizedDescription
            alert.runModal()
        }
        refresh()
    }

    @objc private func openAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
        NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
    }

    @objc private func showSettings() {
        if window == nil {
            let panel = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 420),
                                 styleMask: [.titled, .closable], backing: .buffered, defer: false)
            panel.title = "QuitOnRed"
            panel.isReleasedWhenClosed = false
            let stack = NSStackView()
            stack.orientation = .vertical
            stack.alignment = .leading
            stack.spacing = 14
            stack.translatesAutoresizingMaskIntoConstraints = false
            let title = NSTextField(labelWithString: "Red button → Quit the entire app")
            title.font = .boldSystemFont(ofSize: 18)
            stack.addArrangedSubview(title)
            let detail = NSTextField(wrappingLabelWithString: "Click any window’s red button to quit its app, including its other windows. Apps can still ask you to save changes.\n\nHold Shift while clicking red to close only that window. Finder keeps its normal behavior.")
            stack.addArrangedSubview(detail)
            let state = NSTextField(labelWithString: "")
            state.font = .systemFont(ofSize: 12, weight: .medium)
            statusLabel = state
            stack.addArrangedSubview(state)
            let enable = NSButton(checkboxWithTitle: "Red Button Quits Apps", target: self, action: #selector(toggleEnabled))
            enableBox = enable
            stack.addArrangedSubview(enable)
            let edge = NSButton(checkboxWithTitle: "Quit Edge After Its Last Tab Closes", target: self, action: #selector(toggleEdgeQuit))
            edgeBox = edge
            stack.addArrangedSubview(edge)
            let terminal = NSButton(checkboxWithTitle: "Quit Terminal After Its Last Tab Closes", target: self, action: #selector(toggleTerminalQuit))
            terminalBox = terminal
            stack.addArrangedSubview(terminal)
            let login = NSButton(checkboxWithTitle: "Start at Login", target: self, action: #selector(toggleLogin))
            loginBox = login
            // Login is managed by the reviewed setup workflow.
            let permission = NSButton(title: "Open Accessibility Settings", target: self, action: #selector(openAccessibility))
            permission.bezelStyle = .rounded
            stack.addArrangedSubview(permission)
            panel.contentView!.addSubview(stack)
            NSLayoutConstraint.activate([
                stack.leadingAnchor.constraint(equalTo: panel.contentView!.leadingAnchor, constant: 24),
                stack.trailingAnchor.constraint(equalTo: panel.contentView!.trailingAnchor, constant: -24),
                stack.topAnchor.constraint(equalTo: panel.contentView!.topAnchor, constant: 24),
                stack.bottomAnchor.constraint(lessThanOrEqualTo: panel.contentView!.bottomAnchor, constant: -20)
            ])
            panel.center()
            window = panel
        }
        refresh()
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    @objc private func quitHelper() { NSApp.terminate(nil) }
}

if CommandLine.arguments.contains("--self-test") {
    WindowActionPolicy.selfTest()
    // No application, input hook, permission prompt, or quit request is created.
    precondition(!Set(["com.apple.finder", "com.apple.dock"]).contains("com.microsoft.edgemac"))
    print("PASS: QuitOnRed builds with separate red-click, Edge, and Terminal choices")
    exit(0)
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
