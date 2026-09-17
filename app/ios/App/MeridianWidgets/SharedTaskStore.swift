import Foundation

// Mirrors the JSON the main app writes via its SharedStorePlugin (see
// ios/App/App/SharedStorePlugin.swift) whenever the signed-in user's tasks
// change. Kept as a small duplicated struct rather than a shared framework
// target, to avoid the extra project-file complexity of a file belonging
// to two targets.

struct SharedTaskItem: Codable, Identifiable {
    let id: String
    let title: String
    var completed: Bool
    let dueLabel: String?
    let overdue: Bool
}

struct SharedTaskSnapshot: Codable {
    let tasks: [SharedTaskItem]
    let supabaseUrl: String?
    let supabaseAnonKey: String?
    let accessToken: String?
    let updatedAt: String?
}

enum SharedTaskStore {
    static let appGroupId = "group.com.beaumontglobal.meridian"
    static let storageKey = "meridian.todayTasks"

    static func read() -> SharedTaskSnapshot? {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let raw = defaults.string(forKey: storageKey),
              let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(SharedTaskSnapshot.self, from: data)
    }

    /// Optimistically flips a task's completed state in the local shared
    /// snapshot (so the widget reflects the tap immediately, before the
    /// network call in ToggleTaskIntent confirms it server-side).
    static func setCompletedLocally(taskId: String, completed: Bool) {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              var snapshot = read() else { return }
        let updatedTasks = snapshot.tasks.map { task -> SharedTaskItem in
            guard task.id == taskId else { return task }
            return SharedTaskItem(id: task.id, title: task.title, completed: completed, dueLabel: task.dueLabel, overdue: task.overdue)
        }
        snapshot = SharedTaskSnapshot(
            tasks: updatedTasks,
            supabaseUrl: snapshot.supabaseUrl,
            supabaseAnonKey: snapshot.supabaseAnonKey,
            accessToken: snapshot.accessToken,
            updatedAt: snapshot.updatedAt
        )
        if let data = try? JSONEncoder().encode(snapshot), let json = String(data: data, encoding: .utf8) {
            defaults.set(json, forKey: storageKey)
        }
    }
}
