import Foundation

enum StoredFoodUnit: String, Decodable {
    case serving, grams, ounces, milliliters
    case fluidOunces = "fluid-ounces"
}

struct SavedDiaryMeal: Decodable {
    let id: String
    let name: String
    let updatedAt: String
    let ingredients: [SavedIngredient]
    let totalGrams: Double?
    let servingGrams: Double

    static func decode(_ json: String) throws -> SavedDiaryMeal {
        do {
            let meal = try JSONDecoder().decode(Self.self, from: Data(json.utf8))
            guard validText(meal.id, max: 195), validText(meal.name.trimmingCharacters(in: .whitespacesAndNewlines), max: 150),
                  validTimestamp(meal.updatedAt), (1...100).contains(meal.ingredients.count), validQuantity(meal.servingGrams),
                  meal.totalGrams == nil || validQuantity(meal.totalGrams!) else { throw DiaryActionError.invalidRecord }
            _ = try meal.portion(servings: 1)
            return meal
        } catch { throw DiaryActionError.invalidRecord }
    }

    func portion(servings: Double) throws -> (grams: Double, macros: MacroAmounts) {
        var total = MacroAmounts.zero
        var ingredientGrams = 0.0
        for ingredient in ingredients {
            let portion = try ingredient.portion()
            guard totalGrams != nil || portion.grams != nil else { throw DiaryActionError.invalidRecord }
            total = total.adding(portion.macros)
            ingredientGrams += portion.grams ?? 0
        }
        let batchGrams = totalGrams ?? ingredientGrams
        guard batchGrams.isFinite, batchGrams > 0 else { throw DiaryActionError.invalidRecord }
        let grams = servingGrams * servings
        // Match mealFood -> scaleFood in lib/meals.ts and lib/food.ts, without rounding.
        let macros = total.scaled(by: 100 / batchGrams).scaled(by: grams / 100)
        guard grams.isFinite, grams > 0, grams <= 1e12, macros.isValid else { throw DiaryActionError.invalidRecord }
        return (grams, macros)
    }
}

struct SavedIngredient: Decodable {
    let food: SavedIngredientFood
    let quantity: Double
    let unit: StoredFoodUnit

    func portion() throws -> (grams: Double?, macros: MacroAmounts) {
        guard validQuantity(quantity), food.macros.isValid,
              food.servingGrams == nil || (food.servingGrams!.isFinite && food.servingGrams! >= 0 && food.servingGrams! <= 1e6),
              food.servingMl == nil || validQuantity(food.servingMl!) else { throw DiaryActionError.invalidRecord }
        let volume = food.nutritionBasis == .per100ml || food.nutritionUnit == .ml
        let weight = (food.servingGrams ?? 0) > 0 ? food.servingGrams : nil
        let factor: Double
        let grams: Double?
        if volume {
            guard [.serving, .milliliters, .fluidOunces].contains(unit) else { throw DiaryActionError.invalidRecord }
            grams = nil
            factor = quantity * (unit == .serving ? food.servingMl ?? 100 : unit == .fluidOunces ? DiaryActions.mlPerFluidOunce : 1) / 100
        } else {
            guard [.serving, .grams, .ounces].contains(unit),
                  unit == .serving || weight != nil || food.nutritionBasis != .serving else { throw DiaryActionError.invalidRecord }
            switch unit {
            case .grams: grams = quantity
            case .ounces: grams = quantity * 28.349523125
            default: grams = weight.map { $0 * quantity }
            }
            if food.nutritionBasis == .serving {
                factor = unit == .serving ? quantity : (grams ?? 0) / (weight ?? 0)
            } else {
                guard let grams else { throw DiaryActionError.invalidRecord }
                factor = grams / 100
            }
        }
        let macros = food.macros.scaled(by: factor)
        guard factor.isFinite, factor >= 0,
              [macros.calories, macros.protein, macros.carbs, macros.fat].allSatisfy({ $0.isFinite && $0 >= 0 }),
              grams == nil || (grams!.isFinite && grams! >= 0) else { throw DiaryActionError.invalidRecord }
        return (grams, macros)
    }
}

struct SavedIngredientFood: Decodable {
    enum Basis: String, Decodable { case per100g = "100g", per100ml = "100ml", serving }
    enum Unit: String, Decodable { case g, ml }
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let servingGrams: Double?
    let servingMl: Double?
    let nutritionBasis: Basis?
    let nutritionUnit: Unit?

    var macros: MacroAmounts { MacroAmounts(calories: calories, protein: protein, carbs: carbs, fat: fat) }
}

struct StoredDiaryEntry: Decodable {
    let id: String
    let date: String
    let createdAt: String
    let meal: DiaryMeal
    let name: String
    let source: String
    let sourceId: String?
    let brand: String?
    let sourceUrl: String?
    let servingLabel: String?
    let verified: Bool?
    let quantity: Double
    let unit: StoredFoodUnit
    let grams: Double?
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double

    static func decode(_ json: String) throws -> StoredDiaryEntry {
        do {
            let data = Data(json.utf8)
            // The app requires this field even when the weight is explicitly null.
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], object["grams"] != nil else {
                throw DiaryActionError.invalidRecord
            }
            let entry = try JSONDecoder().decode(Self.self, from: data)
            let macros = MacroAmounts(calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat)
            guard validText(entry.id, max: 200), validText(entry.name, max: 300), entry.source.utf16.count <= 200,
                  validTimestamp(entry.createdAt), validQuantity(entry.quantity), macros.isValid,
                  entry.grams == nil || (entry.grams!.isFinite && entry.grams! >= 0 && entry.grams! <= 1e12),
                  entry.sourceId == nil || validText(entry.sourceId!, max: 200),
                  (entry.brand?.utf16.count ?? 0) <= 300, (entry.servingLabel?.utf16.count ?? 0) <= 200,
                  entry.sourceUrl == nil || (entry.sourceUrl!.utf16.count <= 2000 && URL(string: entry.sourceUrl!)?.scheme != nil) else {
                throw DiaryActionError.invalidRecord
            }
            return entry
        } catch { throw DiaryActionError.invalidRecord }
    }
}

private func validQuantity(_ value: Double) -> Bool { value.isFinite && value > 0 && value <= 1e6 }
private func validText(_ value: String, max: Int) -> Bool { !value.isEmpty && value.utf16.count <= max }
private func validTimestamp(_ value: String) -> Bool {
    let formatter = ISO8601DateFormatter()
    if formatter.date(from: value) != nil { return true }
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value) != nil
}
