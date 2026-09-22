import Foundation

struct MacroAmounts: Decodable, Equatable {
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double

    // Keep aligned with mobile/src/local/repository.ts (schema version 1).
    static let defaults = MacroAmounts(calories: 2400, protein: 180, carbs: 250, fat: 70)
    static let zero = MacroAmounts(calories: 0, protein: 0, carbs: 0, fat: 0)

    var isValid: Bool {
        [calories, protein, carbs, fat].allSatisfy { $0.isFinite && $0 >= 0 && $0 <= 1e12 }
    }

    func adding(_ other: MacroAmounts) -> MacroAmounts {
        MacroAmounts(calories: calories + other.calories, protein: protein + other.protein,
                     carbs: carbs + other.carbs, fat: fat + other.fat)
    }

    func divided(by count: Int) -> MacroAmounts {
        let divisor = Double(count)
        return MacroAmounts(calories: calories / divisor, protein: protein / divisor,
                            carbs: carbs / divisor, fat: fat / divisor)
    }
}

struct MacroCheckIn {
    let startDate: String
    let endDate: String
    let loggedDays: Int
    let averages: MacroAmounts?
    let goals: MacroAmounts
    let hasSavedGoals: Bool

    var dialog: String {
        guard let averages else {
            return "No food was logged in Gramello during the last 7 completed days, ending yesterday. Log your meals to get a macro check-in. Today's entries aren't included yet."
        }
        let goalKind = hasSavedGoals ? "your current daily goals" : "Gramello's default daily goals"
        let coverage = "You logged food on \(loggedDays) of the last 7 completed days, ending yesterday. Comparing your logged-day averages with \(goalKind):"
        let comparisons = [
            comparison("Calories", average: averages.calories, goal: goals.calories, unit: "calories"),
            comparison("Protein", average: averages.protein, goal: goals.protein, unit: "grams"),
            comparison("Carbs", average: averages.carbs, goal: goals.carbs, unit: "grams"),
            comparison("Fat", average: averages.fat, goal: goals.fat, unit: "grams")
        ]
        return ([coverage] + comparisons + ["Logs may be incomplete. Days without entries and today are excluded."]).joined(separator: " ")
    }

    private func comparison(_ name: String, average: Double, goal: Double, unit: String) -> String {
        // Round before comparing, so spoken numbers agree with the difference.
        let roundedAverage = (average * 10).rounded() / 10
        let roundedGoal = (goal * 10).rounded() / 10
        let difference = ((roundedAverage - roundedGoal) * 10).rounded() / 10
        let relation = difference == 0 ? "at your goal" : "\(number(abs(difference))) \(unit) \(difference > 0 ? "over" : "under") your goal of \(number(roundedGoal))"
        return "\(name) averaged \(number(roundedAverage)) \(unit), \(relation)."
    }

    private func number(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 1
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}

enum MacroCheckInError: Error, Equatable {
    case noDiary
    case unsupportedSchema
    case unavailable
    case invalidData

    var dialog: String {
        switch self {
        case .noDiary:
            return "Open Gramello on this device and set up your diary, then ask for your macro check-in again."
        case .unsupportedSchema:
            return "This diary uses a different version of Gramello. Update and open Gramello before trying your macro check-in again."
        case .unavailable:
            return "I couldn't read your Gramello diary right now. Unlock your device, open Gramello, and try again."
        case .invalidData:
            return "Some Gramello diary data couldn't be read, so I can't give an accurate macro check-in. Open Gramello to check your diary and goals."
        }
    }
}
