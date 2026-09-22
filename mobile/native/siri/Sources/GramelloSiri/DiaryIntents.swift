import AppIntents
import Foundation

@available(iOS 16.0, macOS 13.0, *)
extension DiaryMeal: AppEnum {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Diary meal"
    static var caseDisplayRepresentations: [DiaryMeal: DisplayRepresentation] = [
        .breakfast: "Breakfast", .lunch: "Lunch", .dinner: "Dinner", .snacks: "Snacks"
    ]
}

@available(iOS 16.0, macOS 13.0, *)
extension DiaryWaterUnit: AppEnum {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Water unit"
    static var caseDisplayRepresentations: [DiaryWaterUnit: DisplayRepresentation] = [
        .milliliters: "milliliters", .fluidOunces: "US fluid ounces"
    ]
}

@available(iOS 16.0, macOS 13.0, *)
extension DiaryMetric: AppEnum {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Nutrient"
    static var caseDisplayRepresentations: [DiaryMetric: DisplayRepresentation] = [
        .all: "nutrition", .calories: "calories", .protein: "protein", .carbs: "carbs", .fat: "fat"
    ]
}

@available(iOS 16.0, macOS 13.0, *)
struct RemainingMacrosIntent: AppIntent {
    static var title: LocalizedStringResource = "Remaining macros"
    static var description = IntentDescription("Hear today's remaining calories and macros based on your logged food and current goals.")
    static var openAppWhenRun: Bool = false
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let message = diaryIntentMessage {
            try MacroCheckInReader.readToday(databaseURL: MacroCheckInReader.databaseURL()).remainingDialog
        }
        return .result(value: message, dialog: IntentDialog(stringLiteral: message))
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct TodaySummaryIntent: AppIntent {
    static var title: LocalizedStringResource = "Today's nutrition summary"
    static var description = IntentDescription("Hear today's logged calories and macros, or choose a single nutrient, alongside your daily goals.")
    static var openAppWhenRun: Bool = false
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "Nutrient", default: .all)
    var metric: DiaryMetric

    static var parameterSummary: some ParameterSummary { Summary("Summarize today's \(\.$metric)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let message = diaryIntentMessage {
            try MacroCheckInReader.readToday(databaseURL: MacroCheckInReader.databaseURL()).summaryDialog(metric: metric)
        }
        return .result(value: message, dialog: IntentDialog(stringLiteral: message))
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct LogWaterIntent: AppIntent {
    static var title: LocalizedStringResource = "Log water"
    static var description = IntentDescription("Add water to today's diary in milliliters or US fluid ounces.")
    static var openAppWhenRun: Bool = false
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "Amount", requestValueDialog: "How much water would you like to log?")
    var amount: Double
    @Parameter(title: "Unit", requestValueDialog: "Milliliters or US fluid ounces?")
    var unit: DiaryWaterUnit

    static var parameterSummary: some ParameterSummary { Summary("Log \(\.$amount) \(\.$unit) of water today") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let message = diaryIntentMessage(writing: true) {
            _ = try DiaryActions.logWater(databaseURL: MacroCheckInReader.databaseURL(), amount: amount, unit: unit)
            return "Logged \(diaryAmount(amount)) \(unit == .milliliters ? "milliliters" : "US fluid ounces") of water for today in Gramello."
        }
        return .result(value: message, dialog: IntentDialog(stringLiteral: message))
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct SavedMealEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Saved meal"
    static var defaultQuery = SavedMealQuery()
    let id: String
    let name: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

@available(iOS 16.0, macOS 13.0, *)
struct SavedMealQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [SavedMealEntity] {
        try meals().filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [SavedMealEntity] {
        let available = try meals()
        let query = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return available }
        let exact = available.filter { $0.name.compare(query, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame }
        return exact.isEmpty ? available.filter { $0.name.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil } : exact
    }

    func suggestedEntities() async throws -> [SavedMealEntity] { try meals() }

    private func meals() throws -> [SavedMealEntity] {
        try DiaryActions.savedMeals(databaseURL: MacroCheckInReader.databaseURL()).map { SavedMealEntity(id: $0.id, name: $0.name) }
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct LogSavedMealIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a saved meal"
    static var description = IntentDescription("Log a chosen number of servings of one of your saved meals in today's diary.")
    static var openAppWhenRun: Bool = false
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "Saved meal", requestValueDialog: "Which saved meal would you like to log?")
    var savedMeal: SavedMealEntity
    @Parameter(title: "Diary meal", requestValueDialog: "Log it under breakfast, lunch, dinner, or snacks?")
    var meal: DiaryMeal
    @Parameter(title: "Servings", default: 1)
    var servings: Double

    static var parameterSummary: some ParameterSummary { Summary("Log \(\.$servings) servings of \(\.$savedMeal) for \(\.$meal) today") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let message = diaryIntentMessage(writing: true) {
            let name = try DiaryActions.logSavedMeal(databaseURL: MacroCheckInReader.databaseURL(), id: savedMeal.id, servings: servings, meal: meal)
            return "Logged \(diaryAmount(servings)) \(servings == 1 ? "serving" : "servings") of \(name) under \(meal.rawValue.lowercased()) for today in Gramello."
        }
        return .result(value: message, dialog: IntentDialog(stringLiteral: message))
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct RepeatMealIntent: AppIntent {
    static var title: LocalizedStringResource = "Repeat yesterday's meal"
    static var description = IntentDescription("Copy all entries from yesterday's breakfast, lunch, dinner, or snacks into the same meal today. Existing entries stay in place.")
    static var openAppWhenRun: Bool = false
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    @Parameter(title: "Meal", requestValueDialog: "Repeat yesterday's breakfast, lunch, dinner, or snacks?")
    var meal: DiaryMeal

    static var parameterSummary: some ParameterSummary { Summary("Add yesterday's \(\.$meal) to today") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let message = diaryIntentMessage(writing: true) {
            let count = try DiaryActions.repeatYesterday(databaseURL: MacroCheckInReader.databaseURL(), meal: meal)
            return count == 0 ? "No entries were logged for yesterday's \(meal.rawValue.lowercased()). Nothing was added."
                : "Added \(count) \(count == 1 ? "entry" : "entries") from yesterday's \(meal.rawValue.lowercased()) to today's \(meal.rawValue.lowercased()) in Gramello."
        }
        return .result(value: message, dialog: IntentDialog(stringLiteral: message))
    }
}

private func diaryIntentMessage(writing: Bool = false, _ action: () throws -> String) -> String {
    do { return try action() }
    catch let error as DiaryActionError { return error.localizedDescription }
    catch {
        let failure: String
        switch error as? MacroCheckInError {
        case .noDiary: failure = "Open Gramello on this device and set up your diary first."
        case .unsupportedSchema: failure = "Update and open Gramello before using this diary with Siri."
        case .invalidData: failure = "Some diary data couldn't be read accurately. Check your diary and goals in Gramello."
        default: failure = "I couldn't access your diary right now. Unlock your device, open Gramello, and try again."
        }
        return failure + (writing ? " Nothing was logged." : "")
    }
}
