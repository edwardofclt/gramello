import Foundation

struct RecommendationFood {
    let id: String
    let name: String
    let per100g: MacroAmounts
}

struct RecommendationIngredient {
    let food: RecommendationFood
    let grams: Double
}

struct EasyFoodOption {
    let id: String
    let name: String
    let kind: RecommendationKind
    let ingredients: [RecommendationIngredient]
    let preparation: String

    var macros: MacroAmounts {
        ingredients.reduce(.zero) { $0.adding($1.food.per100g.scaled(by: $1.grams / 100)) }
    }
}

enum RecommendationCatalog {
    // USDA FoodData Central values per 100 g, copied from data/food-catalog/usda-core.json.
    // IDs preserve provenance: https://fdc.nal.usda.gov/food-details/<id>/nutrients.
    // Prepared weights and no added oil/sauces keep the instructions aligned with the estimates.
    private static let yogurt = RecommendationFood(id: "usda-170894", name: "plain nonfat Greek yogurt", per100g: MacroAmounts(calories: 59, protein: 10.2, carbs: 3.6, fat: 0.39))
    private static let banana = RecommendationFood(id: "usda-173944", name: "peeled banana", per100g: MacroAmounts(calories: 89, protein: 1.09, carbs: 22.8, fat: 0.33))
    private static let cottageCheese = RecommendationFood(id: "usda-172182", name: "2 percent cottage cheese", per100g: MacroAmounts(calories: 81, protein: 10.4, carbs: 4.76, fat: 2.27))
    private static let chicken = RecommendationFood(id: "usda-171477", name: "cooked skinless chicken breast", per100g: MacroAmounts(calories: 165, protein: 31, carbs: 0, fat: 3.57))
    private static let rice = RecommendationFood(id: "usda-168878", name: "cooked white rice", per100g: MacroAmounts(calories: 130, protein: 2.69, carbs: 28.2, fat: 0.28))
    private static let broccoli = RecommendationFood(id: "usda-169967", name: "cooked broccoli", per100g: MacroAmounts(calories: 35, protein: 2.38, carbs: 7.18, fat: 0.41))
    private static let tuna = RecommendationFood(id: "usda-173709", name: "drained canned light tuna in water", per100g: MacroAmounts(calories: 86, protein: 19.4, carbs: 0, fat: 0.96))
    private static let bread = RecommendationFood(id: "usda-172688", name: "whole-wheat bread, weighed before toasting", per100g: MacroAmounts(calories: 252, protein: 12.4, carbs: 42.7, fat: 3.5))
    private static let chickpeas = RecommendationFood(id: "usda-173800", name: "drained canned chickpeas", per100g: MacroAmounts(calories: 139, protein: 7.05, carbs: 22.5, fat: 2.77))
    private static let tomato = RecommendationFood(id: "usda-170457", name: "raw tomato", per100g: MacroAmounts(calories: 18, protein: 0.88, carbs: 3.89, fat: 0.2))
    private static let egg = RecommendationFood(id: "usda-173424", name: "peeled hard-boiled egg", per100g: MacroAmounts(calories: 155, protein: 12.6, carbs: 1.12, fat: 10.6))
    private static let peanutButter = RecommendationFood(id: "usda-172470", name: "smooth peanut butter", per100g: MacroAmounts(calories: 598, protein: 22.2, carbs: 22.3, fat: 51.4))
    private static let apple = RecommendationFood(id: "usda-171688", name: "apple with skin, core removed", per100g: MacroAmounts(calories: 52, protein: 0.26, carbs: 13.8, fat: 0.17))
    private static let oats = RecommendationFood(id: "usda-173904", name: "dry quick oats", per100g: MacroAmounts(calories: 379, protein: 13.2, carbs: 67.7, fat: 6.52))

    static let options: [EasyFoodOption] = [
        EasyFoodOption(id: "chicken-rice-bowl", name: "a chicken and rice bowl", kind: .meal,
                       ingredients: [.init(food: chicken, grams: 100), .init(food: rice, grams: 150), .init(food: broccoli, grams: 100)],
                       preparation: "Use ready-cooked ingredients and heat through; no added oil or sauce is included."),
        EasyFoodOption(id: "tuna-toast", name: "tuna toast", kind: .meal,
                       ingredients: [.init(food: tuna, grams: 100), .init(food: bread, grams: 60), .init(food: tomato, grams: 100)],
                       preparation: "Toast the bread and top with tuna and sliced tomato; no spread is included."),
        EasyFoodOption(id: "chickpea-rice-bowl", name: "a chickpea and rice bowl", kind: .meal,
                       ingredients: [.init(food: chickpeas, grams: 150), .init(food: rice, grams: 100), .init(food: tomato, grams: 100)],
                       preparation: "Heat the chickpeas and ready-cooked rice, then add chopped tomato; no added oil is included."),
        EasyFoodOption(id: "egg-toast", name: "egg toast", kind: .meal,
                       ingredients: [.init(food: egg, grams: 100), .init(food: bread, grams: 60), .init(food: tomato, grams: 100)],
                       preparation: "Use ready-boiled eggs. Toast the bread and top with sliced egg and tomato; no spread is included."),
        EasyFoodOption(id: "yogurt-oat-bowl", name: "a yogurt, oat, and banana bowl", kind: .meal,
                       ingredients: [.init(food: yogurt, grams: 170), .init(food: oats, grams: 40), .init(food: banana, grams: 100)],
                       preparation: "Cook the oats with water according to the packet, then add yogurt and sliced banana."),
        EasyFoodOption(id: "greek-yogurt", name: "plain Greek yogurt", kind: .snack,
                       ingredients: [.init(food: yogurt, grams: 170)], preparation: "Spoon into a bowl; no toppings are included."),
        EasyFoodOption(id: "cottage-cheese", name: "cottage cheese", kind: .snack,
                       ingredients: [.init(food: cottageCheese, grams: 200)], preparation: "Serve chilled."),
        EasyFoodOption(id: "banana", name: "a banana", kind: .snack,
                       ingredients: [.init(food: banana, grams: 118)], preparation: "Peel and serve."),
        EasyFoodOption(id: "apple-peanut-butter", name: "apple with peanut butter", kind: .snack,
                       ingredients: [.init(food: apple, grams: 180), .init(food: peanutButter, grams: 16)], preparation: "Slice the apple and spread with peanut butter."),
        EasyFoodOption(id: "boiled-egg", name: "a hard-boiled egg", kind: .snack,
                       ingredients: [.init(food: egg, grams: 50)], preparation: "Use a ready-boiled egg, peel, and serve."),
        EasyFoodOption(id: "yogurt-banana", name: "Greek yogurt with banana", kind: .snack,
                       ingredients: [.init(food: yogurt, grams: 170), .init(food: banana, grams: 100)], preparation: "Slice the banana into the yogurt.")
    ]
}
