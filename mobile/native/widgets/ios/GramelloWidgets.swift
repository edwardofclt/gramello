import SwiftUI
import WidgetKit

private let navy = Color(red:0.027,green:0.098,blue:0.153)
private let mint = Color(red:0.431,green:0.906,blue:0.780)
private let blue = Color(red:0.471,green:0.663,blue:1)
private let amber = Color(red:1,green:0.741,blue:0.4)

struct DiaryWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct DiaryWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> DiaryWidgetEntry { example() }
    func getSnapshot(in context: Context, completion: @escaping (DiaryWidgetEntry) -> Void) {
        completion(context.isPreview ? example() : current())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DiaryWidgetEntry>) -> Void) {
        let entry = current()
        let midnight = (entry.snapshot ?? .empty(now:entry.date,timeZone:.current)).nextMidnight(after:entry.date)
        completion(Timeline(entries:[entry,DiaryWidgetEntry(date:midnight,snapshot:entry.snapshot)],policy:.after(midnight)))
    }
    private func current() -> DiaryWidgetEntry {
        let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:WidgetSnapshot.group)?.appendingPathComponent("summary.json")
        return DiaryWidgetEntry(date:Date(),snapshot:url.flatMap { try? WidgetSnapshot.load(from:$0) })
    }
    private func example() -> DiaryWidgetEntry {
        var data = WidgetSnapshot.empty(now:Date(),timeZone:.current,status:"ready")
        data.consumed = WidgetNutrition(calories:1450,protein:108,carbs:156,fat:44)
        data.waterMl = 1250; data.hasFood = true; data.hasWater = true
        data.hasSavedGoals = true; data.hasSavedWaterGoal = true
        return DiaryWidgetEntry(date:Date(),snapshot:data)
    }
}

private enum ContentKind { case today, water, calories, macros }

private struct DiaryWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DiaryWidgetEntry
    let kind: ContentKind
    private var accessory: Bool { family == .accessoryCircular || family == .accessoryInline || family == .accessoryRectangular }

    var body: some View {
        Group {
            if let data = entry.snapshot, data.state(at:entry.date) == .ready {
                content(data).privacySensitive()
                    .accessibilityHint(kind == .water
                        ? (data.hasSavedWaterGoal ? "" : "Using the default water goal")
                        : (data.hasSavedGoals ? "" : "Using default nutrition goals"))
            } else { unavailable }
        }
        .widgetURL(URL(string:"nourish://diary/today"))
        .modifier(WidgetBackground(accessory:accessory))
    }

    @ViewBuilder private var unavailable: some View {
        if family == .accessoryInline { Text("Open Gramello to refresh") }
        else if family == .accessoryCircular {
            VStack { Image(systemName:"arrow.clockwise"); Text("Open app").font(.caption2) }
                .accessibilityLabel("Open Gramello to refresh your widget")
        } else {
            VStack(alignment:.leading,spacing:6) {
                Label("Gramello",systemImage:"leaf.fill").font(.headline)
                Text(entry.snapshot == nil ? "Open Gramello to get started" : "Open Gramello to refresh")
                    .font(accessory ? .caption : .subheadline)
            }.frame(maxWidth:.infinity,alignment:.leading)
        }
    }

    @ViewBuilder private func content(_ data: WidgetSnapshot) -> some View {
        switch family {
        case .accessoryInline:
            if kind == .water {
                Label("\(number(data.waterValue))/\(number(data.waterGoal)) \(data.waterLabel)",systemImage:"drop.fill")
                    .accessibilityLabel(summary(data,water:true))
            } else {
                Label("\(number(data.consumed.calories))/\(number(data.goals.calories)) kcal",systemImage:"flame.fill")
                    .accessibilityLabel(summary(data,water:false))
            }
        case .accessoryCircular:
            let water = kind == .water
            Gauge(value:WidgetSnapshot.progress(water ? data.waterMl : data.consumed.calories,goal:water ? data.waterGoalMl : data.goals.calories)) {
                Image(systemName:water ? "drop.fill" : "flame.fill")
            } currentValueLabel: { Text(number(water ? data.waterValue : data.consumed.calories)).minimumScaleFactor(0.5) }
                .gaugeStyle(.accessoryCircular)
                .accessibilityLabel(summary(data,water:water))
        case .accessoryRectangular:
            if kind == .water {
                VStack(alignment:.leading,spacing:4) {
                    Label("Water logged",systemImage:"drop.fill").font(.headline)
                    Text("\(number(data.waterValue)) / \(number(data.waterGoal)) \(data.waterLabel)").font(.caption)
                    ProgressView(value:WidgetSnapshot.progress(data.waterMl,goal:data.waterGoalMl))
                }.accessibilityElement(children:.ignore).accessibilityLabel(summary(data,water:true))
            } else {
                VStack(alignment:.leading,spacing:2) {
                    compactMacro("Protein",data.consumed.protein,data.goals.protein)
                    compactMacro("Carbs",data.consumed.carbs,data.goals.carbs)
                    compactMacro("Fat",data.consumed.fat,data.goals.fat)
                }
            }
        default:
            if kind == .water { waterHome(data) }
            else { todayHome(data) }
        }
    }

    private func todayHome(_ data: WidgetSnapshot) -> some View {
        VStack(alignment:.leading,spacing:8) {
            HStack {
                Label("TODAY",systemImage:"leaf.fill").font(.system(size:10,weight:.bold)).foregroundStyle(mint).widgetAccentable()
                Spacer(); Text("Gramello").font(.system(size:10)).foregroundStyle(.secondary)
            }
            if family == .systemMedium {
                HStack(spacing:18) {
                    calories(data).frame(maxWidth:.infinity,alignment:.leading)
                    VStack(spacing:7) {
                        macro("Protein",data.consumed.protein,data.goals.protein,mint)
                        macro("Carbs",data.consumed.carbs,data.goals.carbs,blue)
                        macro("Fat",data.consumed.fat,data.goals.fat,amber)
                    }.frame(maxWidth:.infinity)
                }
                HStack {
                    Label("\(number(data.waterValue)) \(data.waterLabel)",systemImage:"drop.fill").foregroundStyle(blue)
                    Spacer(); updated(data)
                }.font(.system(size:10))
            } else {
                calories(data)
                updated(data)
            }
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading)
    }

    private func calories(_ data: WidgetSnapshot) -> some View {
        VStack(alignment:.leading,spacing:4) {
            Text(number(data.consumed.calories)).font(.system(size:34,weight:.bold,design:.rounded)).minimumScaleFactor(0.5).lineLimit(1)
            Text("of \(number(data.goals.calories)) kcal").font(.system(size:12)).foregroundStyle(.secondary)
            ProgressView(value:WidgetSnapshot.progress(data.consumed.calories,goal:data.goals.calories)).tint(mint)
            Text(!data.hasFood ? "No food logged" : data.hasSavedGoals ? "Calories logged" : "Default goal").font(.system(size:10)).foregroundStyle(.secondary)
        }.accessibilityElement(children:.ignore).accessibilityLabel(summary(data,water:false))
    }

    private func waterHome(_ data: WidgetSnapshot) -> some View {
        VStack(alignment:.leading,spacing:8) {
            Label("WATER",systemImage:"drop.fill").font(.system(size:10,weight:.bold)).foregroundStyle(blue).widgetAccentable()
            Text(number(data.waterValue)).font(.system(size:34,weight:.bold,design:.rounded)).minimumScaleFactor(0.5).lineLimit(1)
            Text("of \(number(data.waterGoal)) \(data.waterLabel)").font(.system(size:12)).foregroundStyle(.secondary)
            ProgressView(value:WidgetSnapshot.progress(data.waterMl,goal:data.waterGoalMl)).tint(blue)
            Text(!data.hasWater ? "No water logged" : data.hasSavedWaterGoal ? "Water logged" : "Default goal").font(.system(size:10)).foregroundStyle(.secondary)
            updated(data)
        }.frame(maxWidth:.infinity,maxHeight:.infinity,alignment:.leading)
            .accessibilityElement(children:.ignore).accessibilityLabel(summary(data,water:true))
    }

    private func compactMacro(_ label: String, _ value: Double, _ goal: Double) -> some View {
        HStack { Text(label); Spacer(minLength:4); Text("\(number(value))/\(number(goal))g").monospacedDigit() }
            .font(.system(size:11,weight:.medium)).lineLimit(1).minimumScaleFactor(0.7)
            .accessibilityElement(children:.ignore).accessibilityLabel("\(label), \(number(value)) grams logged, goal \(number(goal)) grams")
    }
    private func macro(_ label: String, _ value: Double, _ goal: Double, _ color: Color) -> some View {
        VStack(spacing:3) {
            compactMacro(label,value,goal)
            ProgressView(value:WidgetSnapshot.progress(value,goal:goal)).tint(color)
        }
    }
    private func updated(_ data: WidgetSnapshot) -> some View {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        return HStack(spacing:3) {
            Text("Updated")
            if let date = f.date(from:data.generatedAt) { Text(date,style:.time) }
        }.font(.system(size:9)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
    }
    private func summary(_ data: WidgetSnapshot, water: Bool) -> String {
        if water { return "Water, \(number(data.waterValue)) \(data.waterLabel) logged, \(data.hasSavedWaterGoal ? "goal" : "default goal") \(number(data.waterGoal)) \(data.waterLabel)" }
        return "Calories, \(number(data.consumed.calories)) logged, \(data.hasSavedGoals ? "goal" : "default goal") \(number(data.goals.calories)). Based on logged food."
    }
    private func number(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(0...1))) }
}

private struct WidgetBackground: ViewModifier {
    let accessory: Bool
    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for:.widget) { if !accessory { navy } }
                .environment(\.colorScheme,.dark)
        } else {
            content.padding(accessory ? 0 : 14).background(accessory ? Color.clear : navy)
                .environment(\.colorScheme,.dark)
        }
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind:"GramelloToday",provider:DiaryWidgetProvider()) { DiaryWidgetView(entry:$0,kind:.today) }
            .configurationDisplayName("Today").description("Your logged calories, macros, and water at a glance.")
            .supportedFamilies([.systemSmall,.systemMedium])
    }
}
struct WaterWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind:"GramelloWater",provider:DiaryWidgetProvider()) { DiaryWidgetView(entry:$0,kind:.water) }
            .configurationDisplayName("Water").description("Water logged against your daily goal.")
            .supportedFamilies([.systemSmall,.accessoryCircular,.accessoryRectangular,.accessoryInline])
    }
}
struct CaloriesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind:"GramelloCalories",provider:DiaryWidgetProvider()) { DiaryWidgetView(entry:$0,kind:.calories) }
            .configurationDisplayName("Calories").description("Today's logged calories and daily goal.")
            .supportedFamilies([.accessoryCircular,.accessoryInline])
    }
}
struct MacrosWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind:"GramelloMacros",provider:DiaryWidgetProvider()) { DiaryWidgetView(entry:$0,kind:.macros) }
            .configurationDisplayName("Macros").description("Logged protein, carbs, and fat against your goals.")
            .supportedFamilies([.accessoryRectangular])
    }
}
@main struct GramelloWidgets: WidgetBundle {
    var body: some Widget { TodayWidget(); WaterWidget(); CaloriesWidget(); MacrosWidget() }
}
