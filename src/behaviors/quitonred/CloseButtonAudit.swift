import AppKit
import ApplicationServices

// Read-only compatibility report: no input hooks, launches or quit requests.
enum CloseButtonAudit {
    private static func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
        return value
    }

    static func run() -> Int32 {
        guard AXIsProcessTrusted() else {
            print("Accessibility access is required for the close-button audit.")
            return 1
        }
        let windows = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        let pids = Set(windows.compactMap { $0[kCGWindowOwnerPID as String] as? Int32 })
        for pid in pids.sorted() {
            guard let app = NSRunningApplication(processIdentifier: pid),
                  WindowActionPolicy.allows(app) || SteamCloseButton.parent(of: app) != nil else { continue }
            let ax = AXUIElementCreateApplication(pid)
            AXUIElementSetMessagingTimeout(ax, 0.2)
            guard let axWindows = attribute(ax, kAXWindowsAttribute) as? [AXUIElement], !axWindows.isEmpty else {
                print("\(app.localizedName ?? "App"): no accessible windows to check")
                continue
            }
            for window in axWindows {
                let close = attribute(window, kAXCloseButtonAttribute)
                let native: Bool
                if let close, CFGetTypeID(close) == AXUIElementGetTypeID() {
                    let button = close as! AXUIElement
                    let owner = attribute(button, kAXWindowAttribute)
                    native = attribute(button, kAXSubroleAttribute) as? String == kAXCloseButtonSubrole
                        && attribute(button, kAXEnabledAttribute) as? Bool == true
                        && owner.map { CFEqual($0, window) } == true
                } else { native = false }
                let custom = SteamCloseButton.parent(of: app) != nil
                print("\(app.localizedName ?? "App") [\(pid)]: \(native ? "standard close button supported" : custom ? "Steam custom close fallback supported" : "no supported close button; inspect window manually")")
            }
        }
        return 0
    }
}
