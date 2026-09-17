import Foundation
import Capacitor
import WidgetKit

// Bridges the web app's task/session snapshot into the App Group's shared
// UserDefaults suite so the Home Screen widget (ios/App/MeridianWidgets/)
// can read it without any network call of its own, and asks WidgetKit to
// redraw immediately rather than waiting for its next scheduled refresh.
//
// JS side: `Capacitor.registerPlugin('SharedStore')`, see src/lib/widgetSync.ts.
@objc(SharedStorePlugin)
public class SharedStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedStorePlugin"
    public let jsName = "SharedStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
    ]

    private static let appGroupId = "group.com.beaumontglobal.meridian"
    private static let storageKey = "meridian.todayTasks"

    @objc func save(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("Missing 'json' argument")
            return
        }
        guard let defaults = UserDefaults(suiteName: SharedStorePlugin.appGroupId) else {
            call.reject("App Group unavailable")
            return
        }
        defaults.set(json, forKey: SharedStorePlugin.storageKey)
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
