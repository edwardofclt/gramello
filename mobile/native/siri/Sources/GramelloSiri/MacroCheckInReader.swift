import Foundation
// Use Expo's SQLite in the app so two independent SQLite runtimes don't manage
// locks on the same file. Standalone Swift tests use the system SQLite library.
#if canImport(ExpoSQLite)
internal import ExpoSQLite
// Expo namespaces its vendored C entry points. Keep the calls below identical
// between the app's SQLite runtime and the standalone system-SQLite tests.
private let sqlite3_open_v2 = exsqlite3_open_v2
private let sqlite3_close = exsqlite3_close
private let sqlite3_busy_timeout = exsqlite3_busy_timeout
private let sqlite3_exec = exsqlite3_exec
private let sqlite3_prepare_v2 = exsqlite3_prepare_v2
private let sqlite3_finalize = exsqlite3_finalize
private let sqlite3_bind_text = exsqlite3_bind_text
private let sqlite3_step = exsqlite3_step
private let sqlite3_column_int = exsqlite3_column_int
private let sqlite3_column_type = exsqlite3_column_type
private let sqlite3_column_text = exsqlite3_column_text
#else
import SQLite3
#endif

enum MacroCheckInReader {
    static func databaseURL() throws -> URL {
        // Expo SQLite's defaultDatabaseDirectory on iOS is Documents/SQLite.
        let documents = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                                                     appropriateFor: nil, create: false)
        return documents.appendingPathComponent("SQLite/gramello-personal.sqlite")
    }

    static func read(databaseURL: URL, now: Date = Date(), timeZone: TimeZone = .current) throws -> MacroCheckIn {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let today = calendar.startOfDay(for: now)
        guard let start = calendar.date(byAdding: .day, value: -7, to: today),
              let end = calendar.date(byAdding: .day, value: -1, to: today) else {
            throw MacroCheckInError.unavailable
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        let startDate = formatter.string(from: start), endDate = formatter.string(from: end)

        guard FileManager.default.fileExists(atPath: databaseURL.path) else { throw MacroCheckInError.noDiary }
        let database = try CheckInDatabase(url: databaseURL)
        // Schema, goals, and diary entries must come from the same snapshot,
        // including while the JavaScript repository replaces a backup.
        try database.execute("BEGIN DEFERRED TRANSACTION")
        defer { try? database.execute("ROLLBACK") }
        var version = 0
        try database.query("PRAGMA user_version") { statement in version = Int(sqlite3_column_int(statement, 0)) }
        guard version != 0 else { throw MacroCheckInError.noDiary }
        guard version == 1 else { throw MacroCheckInError.unsupportedSchema }

        var savedGoals: MacroAmounts?
        try database.query("SELECT value FROM records WHERE kind='goals' AND id='default'") { statement in
            let goals: MacroAmounts = try decode(database.text(statement, 0))
            guard goals.isValid, goals.calories > 0, goals.calories <= 100000 else { throw MacroCheckInError.invalidData }
            savedGoals = goals
        }

        var days: [String: MacroAmounts] = [:]
        try database.query("SELECT id,date,value FROM records WHERE kind='entry' AND date BETWEEN ? AND ?",
                           parameters: [startDate, endDate]) { statement in
            let id = try database.text(statement, 0), date = try database.text(statement, 1)
            let json = try database.text(statement, 2)
            let entry: EntryIdentity = try decode(json)
            let amounts: MacroAmounts = try decode(json)
            guard entry.id == id, entry.date == date, amounts.isValid,
                  date.count == 10, let parsedDate = formatter.date(from: date),
                  formatter.string(from: parsedDate) == date else { throw MacroCheckInError.invalidData }
            days[date] = (days[date] ?? .zero).adding(amounts)
        }
        let total = days.values.reduce(MacroAmounts.zero) { $0.adding($1) }
        return MacroCheckIn(startDate: startDate, endDate: endDate, loggedDays: days.count,
                            averages: days.isEmpty ? nil : total.divided(by: days.count),
                            goals: savedGoals ?? .defaults, hasSavedGoals: savedGoals != nil)
    }

    private struct EntryIdentity: Decodable {
        let id: String
        let date: String
    }

    private static func decode<T: Decodable>(_ json: String) throws -> T {
        do { return try JSONDecoder().decode(T.self, from: Data(json.utf8)) }
        catch { throw MacroCheckInError.invalidData }
    }
}

private final class CheckInDatabase {
    private var handle: OpaquePointer?

    init(url: URL) throws {
        let result = sqlite3_open_v2(url.path, &handle, SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX, nil)
        guard result == SQLITE_OK else {
            _ = sqlite3_close(handle)
            handle = nil
            throw MacroCheckInError.unavailable
        }
        _ = sqlite3_busy_timeout(handle, 500)
    }

    deinit { _ = sqlite3_close(handle) }

    func execute(_ sql: String) throws {
        guard sqlite3_exec(handle, sql, nil, nil, nil) == SQLITE_OK else { throw MacroCheckInError.unavailable }
    }

    func query(_ sql: String, parameters: [String] = [], row: (OpaquePointer) throws -> Void) throws {
        var prepared: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &prepared, nil) == SQLITE_OK, let statement = prepared else {
            _ = sqlite3_finalize(prepared)
            throw MacroCheckInError.unavailable
        }
        defer { _ = sqlite3_finalize(statement) }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        for (index, value) in parameters.enumerated() {
            guard sqlite3_bind_text(statement, Int32(index + 1), value, -1, transient) == SQLITE_OK else {
                throw MacroCheckInError.unavailable
            }
        }
        while true {
            switch sqlite3_step(statement) {
            case SQLITE_ROW: try row(statement)
            case SQLITE_DONE: return
            default: throw MacroCheckInError.unavailable
            }
        }
    }

    func text(_ statement: OpaquePointer, _ column: Int32) throws -> String {
        guard sqlite3_column_type(statement, column) == SQLITE_TEXT,
              let value = sqlite3_column_text(statement, column) else { throw MacroCheckInError.invalidData }
        return String(cString: value)
    }
}
