import AppIntents
import Foundation

@available(iOS 16.0, macOS 13.0, *)
struct MacroCheckInIntent: AppIntent {
    static var title: LocalizedStringResource = "Macro check-in"
    static var description = IntentDescription("Compare your logged-day averages from the last seven completed days with your current calorie and macro goals in Gramello.")
    static var openAppWhenRun: Bool = false
    static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let message: String
        do {
            message = try MacroCheckInReader.read(databaseURL: MacroCheckInReader.databaseURL()).dialog
        } catch let error as MacroCheckInError {
            message = error.dialog
        } catch {
            message = MacroCheckInError.unavailable.dialog
        }
        return .result(value: message, dialog: IntentDialog(stringLiteral: message))
    }
}

@available(iOS 16.0, macOS 13.0, *)
struct GramelloShortcuts: AppShortcutsProvider {
    static var shortcutTileColor: ShortcutTileColor = .teal

    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: MacroCheckInIntent(),
            phrases: [
                "Give me my macro check-in in \(.applicationName)",
                "How am I doing with my macro goals in \(.applicationName)",
                "How have I been eating lately in \(.applicationName)",
                "Check my nutrition goals in \(.applicationName)"
            ],
            shortTitle: "Macro check-in",
            systemImageName: "chart.bar.xaxis"
        )
    }
}
