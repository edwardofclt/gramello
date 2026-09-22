import Foundation

enum RecommendationKind: String, CaseIterable, Sendable {
    case meal
    case snack
}

struct DailyMacroBudget {
    let date: String
    let consumed: MacroAmounts
    let goals: MacroAmounts
    let hasEntries: Bool
    let hasSavedGoals: Bool

    // Preserve negative amounts: exceeding a target must never become a fit.
    var remaining: MacroAmounts {
        MacroAmounts(calories: goals.calories - consumed.calories, protein: goals.protein - consumed.protein,
                     carbs: goals.carbs - consumed.carbs, fat: goals.fat - consumed.fat)
    }
}

extension MacroAmounts {
    func scaled(by factor: Double) -> MacroAmounts {
        MacroAmounts(calories: calories * factor, protein: protein * factor, carbs: carbs * factor, fat: fat * factor)
    }

    func fits(within budget: MacroAmounts) -> Bool {
        isValid && calories <= budget.calories && protein <= budget.protein && carbs <= budget.carbs && fat <= budget.fat
    }
}

struct FoodSuggestion {
    let option: EasyFoodOption
    let scale: Double

    var macros: MacroAmounts { option.macros.scaled(by: scale) }
}

struct FoodRecommendation {
    let budget: DailyMacroBudget
    let kind: RecommendationKind
    let suggestion: FoodSuggestion?

    init(budget: DailyMacroBudget, kind: RecommendationKind) {
        self.budget = budget
        self.kind = kind
        let remaining = budget.remaining
        var best: FoodSuggestion?
        var bestScore = -Double.infinity
        for option in RecommendationCatalog.options where option.kind == kind {
            // Two useful portions, never arbitrarily tiny servings to force a match.
            for scale in [1.0, 0.5] {
                let candidate = FoodSuggestion(option: option, scale: scale)
                let macros = candidate.macros
                guard macros.calories >= (kind == .meal ? 200 : 50), macros.fits(within: remaining) else { continue }
                // Prefer reducing the largest remaining fractions of daily goals.
                let dimensions = [(macros.calories, remaining.calories, budget.goals.calories),
                                  (macros.protein, remaining.protein, budget.goals.protein),
                                  (macros.carbs, remaining.carbs, budget.goals.carbs),
                                  (macros.fat, remaining.fat, budget.goals.fat)]
                let score = dimensions.reduce(0.0) { total, dimension in
                    let (amount, left, goal) = dimension
                    guard goal > 0 else { return total }
                    return total + (left / goal) * (left / goal) - ((left - amount) / goal) * ((left - amount) / goal)
                }
                if score > bestScore { best = candidate; bestScore = score }
            }
        }
        suggestion = best
    }

    var dialog: String {
        let goalKind = budget.hasSavedGoals ? "your current daily goals" : "Gramello's default daily goals"
        let coverage = budget.hasEntries ? "Based on today's logged food and \(goalKind)," : "No food is logged for today. Based on \(goalKind),"
        let remaining = budget.remaining
        let amounts = "you have \(number(max(0, remaining.calories))) calories, \(number(max(0, remaining.protein))) grams protein, \(number(max(0, remaining.carbs))) grams carbs, and \(number(max(0, remaining.fat))) grams fat remaining."
        let caveat = "Logs may be incomplete. Nutrition is estimated; check your ingredients and portions."
        guard let suggestion else {
            let exceeded = [remaining.calories, remaining.protein, remaining.carbs, remaining.fat].contains { $0 < 0 }
                ? " Your logged food already exceeds at least one daily target." : ""
            let fallback = kind == .meal ? " You can also ask for an easy snack." : ""
            return "\(coverage) \(amounts) I couldn't find an easy \(kind.rawValue) in my suggestions that fits all four remaining targets.\(exceeded)\(fallback) \(caveat)"
        }
        let portions = suggestion.option.ingredients.map {
            "\(number($0.grams * suggestion.scale)) grams \($0.food.name)"
        }.joined(separator: ", ")
        let macros = suggestion.macros
        return "\(coverage) \(amounts) Try \(suggestion.option.name): \(portions). \(suggestion.option.preparation) That's an estimated \(number(macros.calories)) calories, \(number(macros.protein)) grams protein, \(number(macros.carbs)) grams carbs, and \(number(macros.fat)) grams fat, within all four remaining targets. \(caveat)"
    }

    private func number(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 1
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
}

extension MacroCheckInError {
    var recommendationDialog: String {
        switch self {
        case .noDiary:
            return "Open Gramello on this device and set up your diary, then ask for a meal or snack suggestion again."
        case .unsupportedSchema:
            return "This diary uses a different version of Gramello. Update and open Gramello before asking for a meal or snack suggestion again."
        case .unavailable:
            return dialog
        case .invalidData:
            return "Some Gramello diary data couldn't be read, so I can't match a meal or snack to your remaining macros. Open Gramello to check your diary and goals."
        }
    }
}
