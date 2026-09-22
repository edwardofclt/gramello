import AppIntents
import Foundation

@available(iOS 16.0, macOS 13.0, *)
extension RecommendationKind: AppEnum {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Food suggestion"
    static var caseDisplayRepresentations: [RecommendationKind: DisplayRepresentation] = [
        .meal: "meal",
        .snack: "snack"
    ]
}

@available(iOS 16.0, macOS 13.0, *)
struct FoodRecommendationIntent: AppIntent {
    static var title: LocalizedStringResource = "Suggest an easy meal or snack"
    static var description = IntentDescription("Suggest a quick meal or snack with portions and estimated nutrition that fits today's remaining calorie, protein, carb, and fat goals in Gramello.")
    static var openAppWhenRun: Bool = false
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "Meal or snack", default: .snack)
    var kind: RecommendationKind

    static var parameterSummary: some ParameterSummary {
        Summary("Suggest an easy \(\.$kind) that fits today's remaining macros")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let message: String
        do {
            let budget = try MacroCheckInReader.readToday(databaseURL: MacroCheckInReader.databaseURL())
            message = FoodRecommendation(budget: budget, kind: kind).dialog
        } catch let error as MacroCheckInError {
            message = error.recommendationDialog
        } catch {
            message = MacroCheckInError.unavailable.recommendationDialog
        }
        return .result(value: message, dialog: IntentDialog(stringLiteral: message))
    }
}
