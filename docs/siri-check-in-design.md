# Siri macro check-in

The approved first integration lets someone ask Siri for a macro check-in in
Gramello. Siri speaks a comparison of recent logged intake against the person's
current goals. This uses ordinary App Intents and App Shortcuts, without an LLM,
AI service, account, or additional model download. Free-form questions without
the app name are not a promised invocation contract.

## Behavior

- Read the seven completed local calendar days before today. Excluding today
  avoids comparing a partial current day with a full daily goal.
- Sum each day's diary entries, then average only days with at least one entry.
  Report the count of logged days out of seven. Even those days may be incomplete;
  the spoken summary must say so. Missing days are not zero intake.
- Compare calories, protein, carbs, and fat with current goals, explicitly named
  as current because the app does not keep goal history. Report numeric differences
  without medical advice or judgments about whether eating is good or bad.
- No logs, missing database, unsupported schema, invalid records, and a temporarily
  unavailable database each produce a useful spoken result instead of invented data.
- Require device authentication for the nutrition read. Do not index personal
  diary content or emit analytics from the native action.

## Native integration

An Expo config plugin copies the checked-in Swift sources into the generated iOS
app target and registers them in the Xcode project. The app target owns the intent,
so it uses the same sandbox as Expo SQLite without an extension or App Group.
The reader opens Documents/SQLite/gramello-personal.sqlite read-only and reads a
single SQLite snapshot. It never creates a database or migrates/writes records.
Schema version 1 and default goals match the TypeScript local repository.

The Swift action returns both a string and an IntentDialog. The shortcut includes
phrases such as "Give me my macro check-in in Gramello" and "How am I doing with
my macro goals in Gramello". An iOS Settings card makes the phrase discoverable.
Android and web keep their existing behavior.

## Implementation and verification plan

1. Add failing Swift tests for real SQLite aggregation, goals, date boundaries,
   zero targets, incomplete coverage, invalid data, missing files, and new schemas.
   Implement a Foundation/SQLite-only reader and summary, then run the tests.
2. Add the AppIntent and AppShortcutsProvider. Type-check with the installed iOS
   SDK and verify compiled App Intents metadata in a native build.
3. Add and test the Expo config plugin for generated source inclusion and repeated
   prebuilds. Add iOS discovery copy and user/developer documentation.
4. Run the repository tests, mobile typecheck/lint, and native verification. Review
   the change for consistency with Expo's database path and the repository schema.
   Record any Siri-on-device checks that cannot be exercised on this Mac.

Physical iPhone verification must cover a fresh install, an existing diary, an
edited goal, deleted entries, backup replacement, a locked device, cold launch,
and spoken invocation. No new dependency is needed in the shipped app.
