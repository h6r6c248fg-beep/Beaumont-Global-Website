import AppIntents
import WidgetKit

/// Lets the user tick a task complete directly from the Home Screen widget
/// (iOS 17+ interactive widgets) without opening the app. Updates the
/// shared snapshot immediately for a responsive tap, fires the same PATCH
/// the web app would make against Supabase's REST API to persist it, then
/// asks WidgetKit to refresh.
///
/// Note: the Supabase access token used here is read from the same App
/// Group UserDefaults suite the main app writes to on sign-in — fine for
/// this scope, but a production app should move that token into a shared
/// Keychain access group instead of UserDefaults for better protection at
/// rest.
struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Task"
    static var description = IntentDescription("Marks a Meridian task complete or incomplete.")

    @Parameter(title: "Task ID")
    var taskId: String

    @Parameter(title: "Completed")
    var completed: Bool

    init() {}

    init(taskId: String, completed: Bool) {
        self.taskId = taskId
        self.completed = completed
    }

    func perform() async throws -> some IntentResult {
        SharedTaskStore.setCompletedLocally(taskId: taskId, completed: completed)
        WidgetCenter.shared.reloadAllTimelines()

        if let snapshot = SharedTaskStore.read(),
           let base = snapshot.supabaseUrl, let anonKey = snapshot.supabaseAnonKey, let token = snapshot.accessToken,
           let url = URL(string: "\(base)/rest/v1/tasks?id=eq.\(taskId)") {
            var request = URLRequest(url: url)
            request.httpMethod = "PATCH"
            request.setValue(anonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let body: [String: Any?] = [
                "completed": completed,
                "completed_at": completed ? ISO8601DateFormatter().string(from: Date()) : nil,
            ]
            request.httpBody = try? JSONSerialization.data(withJSONObject: body.compactMapValues { $0 })
            // Best-effort: the widget can't easily surface a failure to the
            // user, so we fire the request and let the next app-open resync
            // the shared snapshot from the source of truth (Supabase) either way.
            _ = try? await URLSession.shared.data(for: request)
        }

        return .result()
    }
}
