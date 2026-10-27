import Cocoa
import OSAKit

@objc(MacTweakApplication)
final class MacTweakApplication: NSApplication {
    private func installQuitHandler() {
        NSAppleEventManager.shared().setEventHandler(self,andSelector:#selector(handleQuit(_:reply:)),forEventClass:AEEventClass(kCoreEventClass),andEventID:AEEventID(kAEQuitApplication))
    }
    override func finishLaunching() {
        super.finishLaunching()
        // Install after the actual native launch, including when workspace
        // initialization shifts launch later than an arbitrary startup timer.
        installQuitHandler()
    }
    // Use the controller's mutation guard for every native termination route.
    private func requestQuit(_ sender: Any?) -> Bool {
        let action=NSSelectorFromString("quitApplication:")
        if let controller=delegate as? NSObject,controller.responds(to:action) {
            if delegate?.applicationShouldTerminate?(self) == .terminateCancel { return false }
            controller.perform(action,with:sender)
        } else {super.terminate(sender)}
        return true
    }
    override func terminate(_ sender: Any?) { _ = requestQuit(sender) }
    @objc func handleQuit(_ event: NSAppleEventDescriptor,reply: NSAppleEventDescriptor) {
        if !requestQuit(nil) { reply.setParam(NSAppleEventDescriptor(int32:-128),forKeyword:AEKeyword(keyErrorNumber)) }
    }
}
let application=MacTweakApplication.shared as! MacTweakApplication
// Execute JXA in this app's process so Dock, Accessibility and window helpers
// all see Mac Tweak's own regular bundle identity instead of an osascript child.
guard let resources=Bundle.main.resourceURL else {fputs("Mac Tweak resources are missing.\n",stderr);exit(1)}
do {
    let source=try String(contentsOf:resources.appendingPathComponent("src/app/bootstrap.js"),encoding:.utf8)
    let script=OSAScript(source:source,language:OSALanguage(forName:"JavaScript"))
    var error:NSDictionary?
    let result=script.executeAndReturnError(&error)
    if let error {fputs("Cannot open Mac Tweak: \(error)\n",stderr);exit(1)}
    if result?.stringValue == "MAC_TWEAK_UI_READY" {
        withExtendedLifetime(script) {
            // Keep a deferred registration for hosts whose launch was completed
            // by OSAKit before entering this loop. finishLaunching covers later ones.
            _ = Timer.scheduledTimer(withTimeInterval:0.1,repeats:false) { _ in
                NSAppleEventManager.shared().setEventHandler(application,andSelector:#selector(MacTweakApplication.handleQuit(_:reply:)),forEventClass:AEEventClass(kCoreEventClass),andEventID:AEEventID(kAEQuitApplication))
            }
            application.run()
        }
    }
} catch {fputs("Cannot open Mac Tweak: \(error)\n",stderr);exit(1)}
