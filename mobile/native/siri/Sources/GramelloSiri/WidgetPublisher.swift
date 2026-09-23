import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif
#if os(iOS)
import WidgetKit
#endif

enum WidgetPublisher {
    static func refresh() {
        #if os(iOS)
        guard let directory = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:WidgetSnapshot.group),
              let database = try? MacroCheckInReader.databaseURL() else { return }
        do {
            try publish(databaseURL:database,directory:directory)
            WidgetCenter.shared.reloadAllTimelines()
        } catch { /* A saved diary action must still succeed if widget storage is unavailable. */ }
        #endif
    }

    static func publish(databaseURL: URL, directory: URL, now: Date = Date(), timeZone: TimeZone = .current) throws {
        // Both the main app's Siri target and the Expo module compile this code.
        // A file lock serializes the entire read/publish across modules/processes.
        let descriptor = open(directory.appendingPathComponent("summary.lock").path,O_CREAT | O_RDWR,0o600)
        guard descriptor >= 0 else { throw WidgetSnapshot.Failure.unavailable }
        defer { close(descriptor) }
        guard flock(descriptor,LOCK_EX) == 0 else { throw WidgetSnapshot.Failure.unavailable }
        defer { flock(descriptor,LOCK_UN) }
        let snapshot: WidgetSnapshot
        do { snapshot = try read(databaseURL:databaseURL,now:now,timeZone:timeZone) }
        catch { snapshot = .empty(now:now,timeZone:timeZone) }
        let data = try JSONEncoder().encode(snapshot)
        #if os(iOS)
        try data.write(to:directory.appendingPathComponent("summary.json"),options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to:directory.appendingPathComponent("summary.json"),options:.atomic)
        #endif
    }

    static func read(databaseURL: URL, now: Date, timeZone: TimeZone) throws -> WidgetSnapshot {
        let db = try SiriDatabase(url:databaseURL)
        return try db.transaction(writable:false) {
            var summary = WidgetSnapshot.empty(now:now,timeZone:timeZone,status:"ready")
            try db.query("SELECT kind,id,date,value FROM records WHERE (kind IN ('goals','waterGoal') AND id='default') OR (kind IN ('entry','water') AND date=?)",parameters:[summary.date]) { row in
                let kind = try db.text(row,0), id = try db.text(row,1)
                let data = Data(try db.text(row,3).utf8)
                switch kind {
                case "goals":
                    summary.goals = try JSONDecoder().decode(WidgetNutrition.self,from:data)
                    summary.hasSavedGoals = true
                case "waterGoal":
                    let goal = try JSONDecoder().decode(WaterGoal.self,from:data)
                    summary.waterGoalMl = goal.goalMl; summary.waterUnit = goal.unit; summary.hasSavedWaterGoal = true
                case "entry", "water":
                    let identity = try JSONDecoder().decode(Identity.self,from:data)
                    guard identity.id == id, identity.date == summary.date, try db.text(row,2) == summary.date else { throw WidgetSnapshot.Failure.invalid }
                    if kind == "entry" {
                        let value = try JSONDecoder().decode(WidgetNutrition.self,from:data)
                        guard value.valid, [value.calories,value.protein,value.carbs,value.fat].allSatisfy({$0 <= 1e12}) else { throw WidgetSnapshot.Failure.invalid }
                        summary.consumed = summary.consumed.adding(value); summary.hasFood = true
                    } else {
                        let water = try JSONDecoder().decode(Water.self,from:data)
                        guard water.amountMl.isFinite, water.amountMl >= 1, water.amountMl <= 10000 else { throw WidgetSnapshot.Failure.invalid }
                        summary.waterMl += water.amountMl; summary.hasWater = true
                    }
                default: throw WidgetSnapshot.Failure.invalid
                }
            }
            try summary.validate(); return summary
        }
    }
    private struct Identity: Decodable { let id: String; let date: String }
    private struct Water: Decodable { let amountMl: Double }
    private struct WaterGoal: Decodable { let goalMl: Double; let unit: String }
}
