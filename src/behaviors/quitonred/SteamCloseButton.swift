import AppKit
import ApplicationServices
import Darwin

// Steam's CEF helper owns a custom title bar without AXCloseButton. Keep the
// fallback restricted to that helper and its verified Steam parent process.
enum SteamCloseButton {
    static func contains(_ point: CGPoint, in bounds: CGRect) -> Bool {
        guard bounds.width >= 100, bounds.height >= 100 else { return false }
        let dx = point.x - bounds.minX - 18
        let dy = point.y - bounds.minY - 15
        return dx * dx + dy * dy <= 49
    }

    static func parent(of helper: NSRunningApplication) -> NSRunningApplication? {
        guard helper.bundleIdentifier == "com.valvesoftware.steam.helper",
              let helperPath = helper.executableURL?.standardizedFileURL.path else { return nil }
        var info = proc_bsdinfo()
        guard proc_pidinfo(helper.processIdentifier, PROC_PIDTBSDINFO, 0, &info,
                           Int32(MemoryLayout<proc_bsdinfo>.size)) == MemoryLayout<proc_bsdinfo>.size,
              let app = NSRunningApplication(processIdentifier: pid_t(info.pbi_ppid)),
              app.bundleIdentifier == "com.valvesoftware.steam", WindowActionPolicy.allows(app),
              let bundle = app.bundleURL?.standardizedFileURL.path,
              helperPath == bundle + "/Contents/Frameworks/Steam Helper.app/Contents/MacOS/Steam Helper" else { return nil }
        return app
    }

    static func target(at point: CGPoint, hitPID: pid_t) -> (app: NSRunningApplication, window: CGWindowID)? {
        // AX hit-testing ignores click-through overlays (including pointer
        // highlights), while still rejecting controls covered by other apps.
        guard let helper = NSRunningApplication(processIdentifier: hitPID), let app = parent(of: helper),
              let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements],
                                                       kCGNullWindowID) as? [[String: Any]] else { return nil }
        for window in windows {
            guard window[kCGWindowOwnerPID as String] as? Int32 == hitPID,
                  (window[kCGWindowAlpha as String] as? Double ?? 0) > 0.01,
                  let raw = window[kCGWindowBounds as String] as? [String: Any],
                  let bounds = CGRect(dictionaryRepresentation: raw as CFDictionary), bounds.contains(point) else { continue }
            // The first Steam window at the AX hit must contain its close circle.
            guard window[kCGWindowLayer as String] as? Int == 0,
                  contains(point, in: bounds),
                  let id = window[kCGWindowNumber as String] as? UInt32 else { return nil }
            return (app, id)
        }
        return nil
    }

    static func selfTest() {
        let bounds = CGRect(x: 200, y: 300, width: 1000, height: 700)
        precondition(contains(CGPoint(x: 218, y: 315), in: bounds))
        precondition(!contains(CGPoint(x: 238, y: 315), in: bounds)) // minimize
        precondition(!contains(CGPoint(x: 258, y: 315), in: bounds)) // maximize
        precondition(!contains(CGPoint(x: 218, y: 340), in: bounds)) // content
        precondition(!contains(CGPoint(x: 18, y: 15), in: bounds)) // moved window
        precondition(!contains(CGPoint(x: 218, y: 315), in: CGRect(x: 200, y: 300, width: 50, height: 50)))
        precondition(parent(of: NSRunningApplication.current) == nil)
        print("PASS: Steam custom close hit area excludes other controls and unrelated processes")
    }
}
