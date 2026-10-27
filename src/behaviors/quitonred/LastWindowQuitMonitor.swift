import AppKit
import ApplicationServices

// A normal Quit request after an observed app's final window closes. Window
// creation and destruction drive the checks; update() is also a periodic fallback.
final class LastWindowQuitMonitor {
    private let bundleIdentifier: String
    private let canAct: () -> Bool
    private let onQuitRequested: (Bool) -> Void
    private var enabled = false
    private var pid: pid_t = 0
    private var observer: AXObserver?
    private var trackedWindows: [AXUIElement] = []
    private var hadStandardWindow = false
    private var eventCheck: DispatchWorkItem?
    private var emptyCheck: DispatchWorkItem?

    init(bundleIdentifier: String, canAct: @escaping () -> Bool, onQuitRequested: @escaping (Bool) -> Void) {
        self.bundleIdentifier = bundleIdentifier
        self.canAct = canAct
        self.onQuitRequested = onQuitRequested
    }

    func stop() {
        eventCheck?.cancel()
        emptyCheck?.cancel()
        eventCheck = nil
        emptyCheck = nil
        if let observer {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(observer), .commonModes)
        }
        observer = nil
        pid = 0
        trackedWindows = []
        hadStandardWindow = false
    }

    func update(enabled: Bool) {
        self.enabled = enabled
        guard enabled, canAct(), AXIsProcessTrusted(),
              let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).first,
              !app.isTerminated else { stop(); return }
        if pid != app.processIdentifier {
            stop()
            pid = app.processIdentifier
        }
        if observer == nil {
            var newObserver: AXObserver?
            let context = Unmanaged.passUnretained(self).toOpaque()
            if AXObserverCreate(pid, { _, _, _, info in
                guard let info else { return }
                let owner = Unmanaged<LastWindowQuitMonitor>.fromOpaque(info).takeUnretainedValue()
                owner.eventCheck?.cancel()
                let work = DispatchWorkItem { [weak owner] in owner?.checkWindows() }
                owner.eventCheck = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: work)
            }, &newObserver) == .success, let newObserver {
                observer = newObserver
                let element = AXUIElementCreateApplication(pid)
                AXUIElementSetMessagingTimeout(element, 0.1)
                AXObserverAddNotification(newObserver, element, kAXWindowCreatedNotification as CFString, context)
                AXObserverAddNotification(newObserver, element, kAXFocusedWindowChangedNotification as CFString, context)
                CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(newObserver), .commonModes)
            }
        }
        checkWindows()
    }

    private func currentWindows() -> [AXUIElement]? {
        guard pid > 0 else { return nil }
        let element = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(element, 0.1)
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXWindowsAttribute as CFString, &value) == .success else { return nil }
        return value as? [AXUIElement]
    }

    private func isStandardWindow(_ window: AXUIElement) -> Bool {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(window, kAXSubroleAttribute as CFString, &value) == .success else { return false }
        return value as? String == kAXStandardWindowSubrole
    }

    private func checkWindows() {
        guard enabled, canAct() else { stop(); return }
        guard let windows = currentWindows() else { return }
        if let observer {
            let context = Unmanaged.passUnretained(self).toOpaque()
            for window in windows where !trackedWindows.contains(where: { CFEqual($0, window) }) {
                AXObserverAddNotification(observer, window, kAXUIElementDestroyedNotification as CFString, context)
            }
            for old in trackedWindows where !windows.contains(where: { CFEqual($0, old) }) {
                AXObserverRemoveNotification(observer, old, kAXUIElementDestroyedNotification as CFString)
            }
        }
        trackedWindows = windows
        if windows.contains(where: isStandardWindow) { hadStandardWindow = true }
        // Minimized windows and dialogs count, protecting all other sessions.
        guard windows.isEmpty else {
            emptyCheck?.cancel()
            emptyCheck = nil
            return
        }
        guard hadStandardWindow, emptyCheck == nil else { return }
        let expectedPID = pid
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.emptyCheck = nil
            guard self.enabled, self.canAct(), self.pid == expectedPID,
                  self.currentWindows()?.isEmpty == true,
                  let app = NSRunningApplication(processIdentifier: expectedPID), app.bundleIdentifier == self.bundleIdentifier, WindowActionPolicy.allows(app) else { return }
            guard self.canAct() else { return }
            // One request per closure, so canceling an app's quit dialog is respected.
            self.hadStandardWindow = false
            self.onQuitRequested(app.terminate())
        }
        emptyCheck = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: work)
    }
}
