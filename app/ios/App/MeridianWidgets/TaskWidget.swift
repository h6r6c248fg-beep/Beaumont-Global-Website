import WidgetKit
import SwiftUI

private extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        s.removeAll { $0 == "#" }
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

private enum Brand {
    static let ink = Color(hex: "08090C")
    static let panel = Color(hex: "14171F")
    static let line = Color(hex: "262B3A")
    static let paper = Color(hex: "F1EFE9")
    static let mist = Color(hex: "9AA1B4")
    static let gold = Color(hex: "CBA15C")
    static let goldBright = Color(hex: "E4BF7F")
    static let rose = Color(hex: "D97A7A")
}

struct TaskEntry: TimelineEntry {
    let date: Date
    let tasks: [SharedTaskItem]
}

struct TaskTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> TaskEntry {
        TaskEntry(date: Date(), tasks: [
            SharedTaskItem(id: "1", title: "Review Q3 pipeline", completed: false, dueLabel: "Today", overdue: false),
            SharedTaskItem(id: "2", title: "Book bloodwork", completed: false, dueLabel: nil, overdue: true),
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (TaskEntry) -> Void) {
        completion(TaskEntry(date: Date(), tasks: SharedTaskStore.read()?.tasks ?? []))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TaskEntry>) -> Void) {
        let entry = TaskEntry(date: Date(), tasks: SharedTaskStore.read()?.tasks ?? [])
        // The main app pushes a fresh snapshot (and reloads widget timelines)
        // whenever tasks change or the app becomes active, so this periodic
        // refresh is just a safety net for when the app hasn't been opened.
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

struct TaskWidgetEntryView: View {
    var entry: TaskEntry
    @Environment(\.widgetFamily) var family

    private var visibleTasks: [SharedTaskItem] {
        let limit = family == .systemSmall ? 3 : 5
        return Array(entry.tasks.prefix(limit))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "checkmark.circle")
                    .foregroundStyle(Brand.gold)
                Text("Today")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Brand.paper)
                Spacer()
                let remaining = entry.tasks.filter { !$0.completed }.count
                if remaining > 0 {
                    Text("\(remaining)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Brand.ink)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Brand.gold, in: Capsule())
                }
            }

            if visibleTasks.isEmpty {
                Spacer()
                Text("Nothing due — you're clear.")
                    .font(.system(size: 12))
                    .foregroundStyle(Brand.mist)
                Spacer()
            } else {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(visibleTasks) { task in
                        TaskRowView(task: task)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(URL(string: "meridianapp://tasks"))
    }
}

private struct TaskRowView: View {
    let task: SharedTaskItem

    var body: some View {
        HStack(spacing: 8) {
            Button(intent: ToggleTaskIntent(taskId: task.id, completed: !task.completed)) {
                Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(task.completed ? Brand.gold : Brand.mist)
                    .font(.system(size: 15))
            }
            .buttonStyle(.plain)

            Text(task.title)
                .font(.system(size: 12.5))
                .foregroundStyle(task.completed ? Brand.mist : Brand.paper)
                .strikethrough(task.completed)
                .lineLimit(1)

            Spacer(minLength: 0)

            if let due = task.dueLabel {
                Text(due)
                    .font(.system(size: 10.5, weight: .medium))
                    .foregroundStyle(task.overdue ? Brand.rose : Brand.mist)
            }
        }
    }
}

struct TaskWidget: Widget {
    let kind: String = "MeridianTaskWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TaskTimelineProvider()) { entry in
            TaskWidgetEntryView(entry: entry)
                .containerBackground(for: .widget) {
                    Brand.panel
                }
        }
        .configurationDisplayName("Today's Tasks")
        .description("See and check off what's due today without opening Meridian.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
