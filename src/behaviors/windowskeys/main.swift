import AppKit
import IOKit.hidsystem

// A physical PC Ctrl key becomes Command; the Windows key becomes Control.
// Existing destination-device mappings are honored; no source device ID is copied.
let pcMapping: [[String: UInt64]] = [
    ["HIDKeyboardModifierMappingSrc": 0x7000000e0, "HIDKeyboardModifierMappingDst": 0x7000000e3],
    ["HIDKeyboardModifierMappingSrc": 0x7000000e3, "HIDKeyboardModifierMappingDst": 0x7000000e0],
    ["HIDKeyboardModifierMappingSrc": 0x7000000e4, "HIDKeyboardModifierMappingDst": 0x7000000e7],
    ["HIDKeyboardModifierMappingSrc": 0x7000000e7, "HIDKeyboardModifierMappingDst": 0x7000000e4]
]
func sameMap(_ a: [[String: UInt64]], _ b: [[String: UInt64]]) -> Bool {
    return a.count == b.count && Set(a.compactMap { $0["HIDKeyboardModifierMappingSrc"] }).count == a.count && a.allSatisfy { b.contains($0) }
}
func route(host: [[String: UInt64]], runtime: [[String: UInt64]], owned: Bool) -> String {
    if !host.isEmpty { return sameMap(host, pcMapping) && runtime.isEmpty ? "inherited" : "conflict" }
    if runtime.isEmpty { return "apply" }
    return owned && sameMap(runtime, pcMapping) ? "owned" : "conflict"
}
func decodeMap(_ raw: CFTypeRef?) -> [[String: UInt64]]? {
    guard let raw else { return [] }
    guard let rows = raw as? [[String: NSNumber]], rows.count <= 256 else { return nil }
    var result: [[String: UInt64]] = []
    for row in rows {
        guard row.count == 2, let src = row["HIDKeyboardModifierMappingSrc"], let dst = row["HIDKeyboardModifierMappingDst"],
              src.int64Value >= 0, dst.int64Value >= 0 else { return nil }
        result.append(["HIDKeyboardModifierMappingSrc": src.uint64Value, "HIDKeyboardModifierMappingDst": dst.uint64Value])
    }
    return result
}
if CommandLine.arguments.contains("--self-test") {
    precondition(decodeMap(nil) == [])
    precondition(decodeMap("unexpected" as CFString) == nil)
    precondition(route(host: pcMapping, runtime: [], owned: false) == "inherited")
    precondition(route(host: Array(repeating: pcMapping[0], count: 4), runtime: [], owned: false) == "conflict")
    precondition(route(host: [], runtime: [], owned: false) == "apply")
    precondition(route(host: [], runtime: pcMapping, owned: false) == "conflict")
    precondition(route(host: [], runtime: pcMapping, owned: true) == "owned")
    precondition(route(host: pcMapping, runtime: pcMapping, owned: true) == "conflict")
    precondition(Set(pcMapping.compactMap { $0["HIDKeyboardModifierMappingSrc"] }).count == 4)
    print("PASS: Windows modifier mappings, inherited mapping, conflict and ownership guards")
    exit(0)
}
final class KeyMapping: NSObject, NSApplicationDelegate {
    private let client = IOHIDEventSystemClientCreateSimpleClient(kCFAllocatorDefault)
    private var owned: [UInt64: IOHIDServiceClient] = [:]
    private var timer: Timer?
    private var status: NSStatusItem!
    private var signals: [DispatchSourceSignal] = []
    private let preferences = UserDefaults(suiteName: "org.macossetup.windowskeys")!
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Use a stable bundle identity to avoid duplicate instances.
        if let id = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: id).contains(where: { $0.processIdentifier != getpid() }) { NSApp.terminate(nil); return }
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        status.button?.image = NSImage(systemSymbolName: "keyboard", accessibilityDescription: "Windows keyboard")
        let menu = NSMenu()
        menu.addItem(withTitle: "Windows keyboard mapping", action: nil, keyEquivalent: "")
        let quit = menu.addItem(withTitle: "Stop mapping", action: #selector(stop), keyEquivalent: "q"); quit.target = self
        status.menu = menu
        tick(); timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.tick() }
        for sig in [SIGTERM, SIGINT] {
            signal(sig, SIG_IGN); let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
            source.setEventHandler { NSApp.terminate(nil) }; source.resume(); signals.append(source)
        }
    }
    func applicationWillTerminate(_ notification: Notification) { timer?.invalidate(); restore() }
    private func current(_ service: IOHIDServiceClient) -> [[String: UInt64]]? {
        return decodeMap(IOHIDServiceClientCopyProperty(service, "UserKeyMapping" as CFString))
    }
    private func restore() {
        for (_, service) in owned where current(service).map({ sameMap($0, pcMapping) }) == true {
            IOHIDServiceClientSetProperty(service, "UserKeyMapping" as CFString, [] as CFArray)
        }
        owned.removeAll()
    }
    @objc private func stop() { NSApp.terminate(nil) }
    private func tick() {
        guard preferences.object(forKey: "enabled") as? Bool ?? true else { restore(); status.button?.toolTip = "Windows keyboard mapping paused"; return }
        let services = IOHIDEventSystemClientCopyServices(client) as? [IOHIDServiceClient] ?? []
        var conflicts = 0
        for service in services {
            func number(_ name: String) -> Int { (IOHIDServiceClientCopyProperty(service, name as CFString) as? NSNumber)?.intValue ?? 0 }
            guard number("PrimaryUsagePage") == 1, number("PrimaryUsage") == 6,
                  number("VendorID") > 0, number("ProductID") > 0 else { continue }
            let id = (IOHIDServiceClientGetRegistryID(service) as? NSNumber)?.uint64Value ?? 0
            let key = "com.apple.keyboard.modifiermapping.\(number("VendorID"))-\(number("ProductID"))-0"
            guard id != 0, let host = decodeMap(CFPreferencesCopyValue(key as CFString, kCFPreferencesAnyApplication,
                                             kCFPreferencesCurrentUser, kCFPreferencesCurrentHost)), let runtime = current(service) else { conflicts += 1; continue }
            switch route(host: host, runtime: runtime, owned: owned[id] != nil) {
            case "apply":
                if IOHIDServiceClientSetProperty(service, "UserKeyMapping" as CFString, pcMapping as CFArray), current(service).map({ sameMap($0, pcMapping) }) == true { owned[id] = service }
                else { conflicts += 1 }
            case "conflict": conflicts += 1
            default: break
            }
        }
        status.button?.toolTip = conflicts == 0 ? "Ctrl → Command · Windows → Control · Alt unchanged" : "Existing keyboard mapping preserved; resolve conflicts in System Settings"
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = KeyMapping(); app.delegate = delegate; app.run()
