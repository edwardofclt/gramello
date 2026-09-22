import XCTest
@testable import GramelloSiri

final class FoodRecommendationTests: XCTestCase {
    private func budget(_ remaining: MacroAmounts, hasEntries: Bool = true, hasSavedGoals: Bool = true) -> DailyMacroBudget {
        DailyMacroBudget(date: "2026-09-22", consumed: .zero, goals: remaining,
                         hasEntries: hasEntries, hasSavedGoals: hasSavedGoals)
    }

    func testSuggestsSpecificPortionThatFitsEveryRemainingTarget() throws {
        let report = FoodRecommendation(budget: budget(MacroAmounts(calories: 120, protein: 20, carbs: 7, fat: 1)), kind: .snack)
        let suggestion = try XCTUnwrap(report.suggestion)
        XCTAssertEqual(suggestion.option.id, "greek-yogurt")
        XCTAssertEqual(suggestion.scale, 1)
        XCTAssertEqual(suggestion.macros.calories, 100.3, accuracy: 0.00001)
        XCTAssertEqual(suggestion.macros.protein, 17.34, accuracy: 0.00001)
        XCTAssertEqual(suggestion.macros.carbs, 6.12, accuracy: 0.00001)
        XCTAssertEqual(suggestion.macros.fat, 0.663, accuracy: 0.00001)
        XCTAssertTrue(report.dialog.contains("170 grams"))
        XCTAssertTrue(report.dialog.contains("estimated"))
        XCTAssertTrue(report.dialog.contains("Logs may be incomplete"))
    }

    func testUsesSmallerPracticalPortionWhenFullPortionDoesNotFit() throws {
        let report = FoodRecommendation(budget: budget(MacroAmounts(calories: 60, protein: 10, carbs: 4, fat: 1)), kind: .snack)
        let suggestion = try XCTUnwrap(report.suggestion)
        XCTAssertEqual(suggestion.option.id, "greek-yogurt")
        XCTAssertEqual(suggestion.scale, 0.5)
        XCTAssertTrue(report.dialog.contains("85 grams"))
        XCTAssertEqual(suggestion.macros.calories, 50.15, accuracy: 0.00001)
    }

    func testCalorieRoomAloneDoesNotAllowExceedingAnyMacro() {
        for remaining in [
            MacroAmounts(calories: 500, protein: 0, carbs: 100, fat: 50),
            MacroAmounts(calories: 500, protein: 100, carbs: 0, fat: 0),
            MacroAmounts(calories: 500, protein: 100, carbs: 100, fat: 0),
            MacroAmounts(calories: 0, protein: 100, carbs: 100, fat: 50),
            MacroAmounts(calories: -20, protein: 100, carbs: 100, fat: 50)
        ] {
            let report = FoodRecommendation(budget: budget(remaining), kind: .snack)
            XCTAssertNil(report.suggestion)
            XCTAssertTrue(report.dialog.contains("couldn't find"))
            XCTAssertFalse(report.dialog.contains("skip"))
        }
    }

    func testAlreadyExceededMacroIsNotClampedIntoAFalseFit() {
        let day = DailyMacroBudget(date: "2026-09-22", consumed: MacroAmounts(calories: 100, protein: 20, carbs: 11, fat: 1),
                                  goals: MacroAmounts(calories: 600, protein: 100, carbs: 10, fat: 20),
                                  hasEntries: true, hasSavedGoals: true)
        XCTAssertEqual(day.remaining.carbs, -1)
        XCTAssertNil(FoodRecommendation(budget: day, kind: .meal).suggestion)
    }

    func testMealAndSnackRequestsStayInTheirCategory() throws {
        for kind in [RecommendationKind.meal, .snack] {
            let report = FoodRecommendation(budget: budget(.defaults), kind: kind)
            let suggestion = try XCTUnwrap(report.suggestion)
            XCTAssertEqual(suggestion.option.kind, kind)
            XCTAssertGreaterThanOrEqual(suggestion.macros.calories, kind == .meal ? 200 : 50)
            XCTAssertFalse(suggestion.option.preparation.isEmpty)
        }
        let tight = FoodRecommendation(budget: budget(MacroAmounts(calories: 120, protein: 20, carbs: 7, fat: 1)), kind: .meal)
        XCTAssertNil(tight.suggestion)
        XCTAssertTrue(tight.dialog.contains("snack"))
    }

    func testEmptyDayAndDefaultGoalsAreExplicit() {
        let report = FoodRecommendation(budget: budget(.defaults, hasEntries: false, hasSavedGoals: false), kind: .meal)
        XCTAssertNotNil(report.suggestion)
        XCTAssertTrue(report.dialog.contains("No food is logged for today"))
        XCTAssertTrue(report.dialog.contains("default daily goals"))
    }

    func testMatchesUseUnroundedNutritionAndNeverExceedBudget() {
        for calories in [50.14, 100.29, 200, 500, 2000] {
            for protein in [5.0, 20, 60, 180] {
                for carbs in [4.0, 15, 60, 250] {
                    for fat in [0.3, 1, 5, 30] {
                        let remaining = MacroAmounts(calories: calories, protein: protein, carbs: carbs, fat: fat)
                        for kind in [RecommendationKind.meal, .snack] {
                            if let result = FoodRecommendation(budget: budget(remaining), kind: kind).suggestion {
                                XCTAssertLessThanOrEqual(result.macros.calories, calories)
                                XCTAssertLessThanOrEqual(result.macros.protein, protein)
                                XCTAssertLessThanOrEqual(result.macros.carbs, carbs)
                                XCTAssertLessThanOrEqual(result.macros.fat, fat)
                            }
                        }
                    }
                }
            }
        }
    }
}
