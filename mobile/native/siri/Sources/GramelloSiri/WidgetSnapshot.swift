import Foundation

struct WidgetNutrition: Codable, Equatable {
    var calories: Double, protein: Double, carbs: Double, fat: Double
    static let zero = Self(calories:0, protein:0, carbs:0, fat:0)
    static let defaults = Self(calories:2400, protein:180, carbs:250, fat:70)
    var valid: Bool { [calories,protein,carbs,fat].allSatisfy { $0.isFinite && $0 >= 0 } }
    func adding(_ other: Self) -> Self {
        Self(calories:calories+other.calories,protein:protein+other.protein,carbs:carbs+other.carbs,fat:fat+other.fat)
    }
}

// Shared by the app, Expo module, and extension. No SQLite or React dependency.
struct WidgetSnapshot: Codable {
    static let group = "group.com.edwardofclt.nourish.widgets"
    var version: Int
    var status: String
    var date: String
    var timeZone: String
    var generatedAt: String
    var consumed: WidgetNutrition
    var goals: WidgetNutrition
    var hasFood: Bool, hasWater: Bool, hasSavedGoals: Bool, hasSavedWaterGoal: Bool
    var waterMl: Double, waterGoalMl: Double
    var waterUnit: String

    enum State { case ready, stale, unavailable }
    enum Failure: Error { case invalid, unavailable }

    static func day(_ now: Date, timeZone: TimeZone) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier:"en_US_POSIX")
        f.calendar = Calendar(identifier:.gregorian); f.timeZone = timeZone; f.dateFormat = "yyyy-MM-dd"
        return f.string(from:now)
    }

    static func empty(now: Date, timeZone: TimeZone, status: String = "unavailable") -> Self {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        return Self(version:1,status:status,date:day(now,timeZone:timeZone),timeZone:timeZone.identifier,
                    generatedAt:f.string(from:now),consumed:.zero,goals:.defaults,hasFood:false,hasWater:false,
                    hasSavedGoals:false,hasSavedWaterGoal:false,waterMl:0,waterGoalMl:2000,waterUnit:"ml")
    }

    func validate() throws {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        guard version == 1, ["ready","unavailable"].contains(status),
              let zone = TimeZone(identifier:timeZone), let generated = f.date(from:generatedAt),
              date == Self.day(generated,timeZone:zone), consumed.valid, goals.valid,
              goals.calories > 0, goals.calories <= 100000,
              [goals.protein,goals.carbs,goals.fat].allSatisfy({$0 <= 1e12}),
              waterMl.isFinite, waterMl >= 0, waterGoalMl.isFinite, waterGoalMl >= 1, waterGoalMl <= 10000,
              ["ml","fl-oz"].contains(waterUnit) else { throw Failure.invalid }
    }

    static func load(from url: URL) throws -> Self {
        let size = try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0
        guard size <= 16384 else { throw Failure.invalid }
        let value = try JSONDecoder().decode(Self.self,from:Data(contentsOf:url))
        try value.validate(); return value
    }

    func state(at now: Date = Date(), timeZone zone: TimeZone = .current) -> State {
        guard (try? validate()) != nil, status == "ready" else { return .unavailable }
        return date == Self.day(now,timeZone:zone) && timeZone == zone.identifier ? .ready : .stale
    }

    func nextMidnight(after now: Date, timeZone: TimeZone = .current) -> Date {
        var calendar = Calendar(identifier:.gregorian); calendar.timeZone = timeZone
        return calendar.date(byAdding:.day,value:1,to:calendar.startOfDay(for:now)) ?? now.addingTimeInterval(3600)
    }

    static func progress(_ value: Double, goal: Double) -> Double {
        guard value.isFinite, goal.isFinite, goal > 0 else { return 0 }
        return min(1,max(0,value/goal))
    }

    var waterValue: Double { waterUnit == "fl-oz" ? waterMl / 29.5735295625 : waterMl }
    var waterGoal: Double { waterUnit == "fl-oz" ? waterGoalMl / 29.5735295625 : waterGoalMl }
    var waterLabel: String { waterUnit == "fl-oz" ? "US fl oz" : "mL" }
}
