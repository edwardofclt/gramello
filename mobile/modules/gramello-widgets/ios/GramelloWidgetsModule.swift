import ExpoModulesCore

public class GramelloWidgetsModule: Module {
    public func definition() -> ModuleDefinition {
        Name("GramelloWidgets")
        AsyncFunction("refresh") { WidgetPublisher.refresh() }
    }
}
