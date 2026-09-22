import Foundation

enum DiaryMeal: String, CaseIterable, Codable, Sendable {
    case breakfast = "Breakfast", lunch = "Lunch", dinner = "Dinner", snacks = "Snacks"
}

enum DiaryWaterUnit: String, CaseIterable, Sendable {
    case milliliters, fluidOunces
}

enum DiaryMetric: String, CaseIterable, Sendable {
    case all, calories, protein, carbs, fat
}

enum DiaryActionError: Error, LocalizedError {
    case waterAmount, servingAmount, missingMeal, invalidRecord

    var errorDescription: String? {
        switch self {
        case .waterAmount: return "Choose a water amount between 1 and 10,000 milliliters, or the equivalent in US fluid ounces. Nothing was logged."
        case .servingAmount: return "Choose a positive serving amount up to 1,000,000. Nothing was logged."
        case .missingMeal: return "That saved meal is no longer available. Open My meals in Gramello and choose an existing meal. Nothing was logged."
        case .invalidRecord: return "This meal or diary entry couldn't be read accurately. Check it in Gramello. Nothing was logged."
        }
    }
}

enum DiaryActions {
    static let mlPerFluidOunce = 29.5735295625

    static func date(_ now: Date, timeZone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: now)
    }

    static func timestamp(_ now: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: now)
    }

    static func logWater(databaseURL: URL, amount: Double, unit: DiaryWaterUnit,
                         now: Date = Date(), timeZone: TimeZone = .current) throws -> Double {
        let ml = unit == .fluidOunces ? amount * mlPerFluidOunce : amount
        guard ml.isFinite, ml >= 1, ml <= 10000 else { throw DiaryActionError.waterAmount }
        let database = try SiriDatabase(url: databaseURL, writable: true)
        let day = date(now, timeZone: timeZone), id = UUID().uuidString
        try database.transaction(writable: true) {
            try insert(database, kind: "water", id: id, date: day,
                       object: ["id": id, "date": day, "amountMl": ml, "createdAt": timestamp(now)])
        }
        return ml
    }

    static func savedMeals(databaseURL: URL) throws -> [SavedDiaryMeal] {
        let database = try SiriDatabase(url: databaseURL)
        return try database.transaction(writable: false) {
            var meals: [SavedDiaryMeal] = []
            try database.query("SELECT id,value FROM records WHERE kind='meal' ORDER BY json_extract(value,'$.name'),id") { statement in
                let value = try SavedDiaryMeal.decode(database.text(statement, 1))
                guard value.id == (try database.text(statement, 0)) else { throw DiaryActionError.invalidRecord }
                meals.append(value)
            }
            return meals
        }
    }

    static func logSavedMeal(databaseURL: URL, id: String, servings: Double, meal: DiaryMeal,
                             now: Date = Date(), timeZone: TimeZone = .current) throws -> String {
        guard servings.isFinite, servings > 0, servings <= 1e6 else { throw DiaryActionError.servingAmount }
        let database = try SiriDatabase(url: databaseURL, writable: true)
        return try database.transaction(writable: true) {
            var saved: SavedDiaryMeal?
            try database.query("SELECT value FROM records WHERE kind='meal' AND id=?", parameters: [id]) {
                saved = try SavedDiaryMeal.decode(database.text($0, 0))
            }
            guard let saved else { throw DiaryActionError.missingMeal }
            guard saved.id == id else { throw DiaryActionError.invalidRecord }
            let portion = try saved.portion(servings: servings)
            let day = date(now, timeZone: timeZone), entryID = UUID().uuidString
            let object: [String: Any] = [
                "id": entryID, "date": day, "createdAt": timestamp(now), "meal": meal.rawValue,
                "name": saved.name, "source": "My meals", "sourceId": "meal-\(id)", "verified": false,
                "quantity": servings, "unit": "serving", "grams": portion.grams,
                "servingLabel": "\(diaryAmount(saved.servingGrams)) g",
                "calories": portion.macros.calories, "protein": portion.macros.protein,
                "carbs": portion.macros.carbs, "fat": portion.macros.fat
            ]
            try insert(database, kind: "entry", id: entryID, date: day, object: object)
            return saved.name
        }
    }

    static func repeatYesterday(databaseURL: URL, meal: DiaryMeal,
                                now: Date = Date(), timeZone: TimeZone = .current) throws -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        guard let previous = calendar.date(byAdding: .day, value: -1, to: now) else { throw MacroCheckInError.unavailable }
        let today = date(now, timeZone: timeZone), yesterday = date(previous, timeZone: timeZone)
        let database = try SiriDatabase(url: databaseURL, writable: true)
        return try database.transaction(writable: true) {
            var entries: [[String: Any]] = []
            try database.query("SELECT id,value FROM records WHERE kind='entry' AND date=? AND json_extract(value,'$.meal')=? ORDER BY id",
                               parameters: [yesterday, meal.rawValue]) { statement in
                let text = try database.text(statement, 1)
                let entry = try StoredDiaryEntry.decode(text)
                guard entry.id == (try database.text(statement, 0)), entry.date == yesterday, entry.meal == meal else {
                    throw DiaryActionError.invalidRecord
                }
                guard var object = try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else {
                    throw DiaryActionError.invalidRecord
                }
                object["id"] = UUID().uuidString
                object["date"] = today
                object["createdAt"] = timestamp(now)
                entries.append(object)
            }
            for entry in entries {
                guard let id = entry["id"] as? String else { throw DiaryActionError.invalidRecord }
                try insert(database, kind: "entry", id: id, date: today, object: entry)
            }
            return entries.count
        }
    }

    private static func insert(_ database: SiriDatabase, kind: String, id: String, date: String, object: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard let json = String(data: data, encoding: .utf8) else { throw DiaryActionError.invalidRecord }
        try database.query("INSERT INTO records(kind,id,date,value) VALUES(?,?,?,?)", parameters: [kind, id, date, json]) { _ in }
    }
}

func diaryNumber(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 1
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
}

// Keep user-entered water and serving amounts precise in logging confirmations.
func diaryAmount(_ value: Double) -> String {
    if value > 0 && value < 0.000001 { return String(value) }
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 6
    return formatter.string(from: NSNumber(value: value)) ?? String(value)
}

extension DailyMacroBudget {
    private var goalDescription: String { hasSavedGoals ? "your current daily goals" : "Gramello's default daily goals" }
    private var coverage: String { hasEntries ? "Based on today's logged food" : "No food is logged for today" }

    var remainingDialog: String {
        let values = [(remaining.calories, "calories"), (remaining.protein, "grams protein"),
                      (remaining.carbs, "grams carbs"), (remaining.fat, "grams fat")]
        let amounts = values.map { "\(diaryNumber(abs($0.0))) \($0.1) \($0.0 < 0 ? "over goal" : "remaining")" }.joined(separator: ", ")
        return "\(coverage), compared with \(goalDescription): \(amounts). Logs may be incomplete."
    }

    func summaryDialog(metric: DiaryMetric) -> String {
        let values: [(DiaryMetric, Double, Double, String)] = [
            (.calories, consumed.calories, goals.calories, "calories"), (.protein, consumed.protein, goals.protein, "grams protein"),
            (.carbs, consumed.carbs, goals.carbs, "grams carbs"), (.fat, consumed.fat, goals.fat, "grams fat")
        ]
        let amounts = values.filter { metric == .all || $0.0 == metric }.map {
            "\(diaryNumber($0.1)) \($0.3), with a goal of \(diaryNumber($0.2))"
        }.joined(separator: "; ")
        return "\(coverage): \(amounts). These are \(goalDescription). Logs may be incomplete."
    }
}
