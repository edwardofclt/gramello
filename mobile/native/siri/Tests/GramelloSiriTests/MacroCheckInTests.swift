import Foundation
import SQLite3
import XCTest
@testable import GramelloSiri

final class MacroCheckInTests: XCTestCase {
    private var directory: URL!
    private var databaseURL: URL { directory.appendingPathComponent("diary.sqlite") }
    private var writer: OpaquePointer?
    private let now = ISO8601DateFormatter().date(from: "2026-09-22T16:00:00Z")!
    private let zone = TimeZone(identifier: "America/New_York")!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        XCTAssertEqual(sqlite3_open(databaseURL.path, &writer), SQLITE_OK)
        try sql("""
            PRAGMA journal_mode=WAL;
            PRAGMA user_version=1;
            CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,date TEXT,value TEXT NOT NULL CHECK(json_valid(value)),PRIMARY KEY(kind,id));
            """)
    }

    override func tearDownWithError() throws {
        sqlite3_close(writer)
        writer = nil
        try FileManager.default.removeItem(at: directory)
    }

    private func sql(_ text: String) throws {
        guard sqlite3_exec(writer, text, nil, nil, nil) == SQLITE_OK else {
            throw NSError(domain: "SQLite test fixture", code: 1, userInfo: [NSLocalizedDescriptionKey: String(cString: sqlite3_errmsg(writer))])
        }
    }

    private func entry(_ date: String, calories: Double = 100, protein: Double = 10, carbs: Double = 20, fat: Double = 5) throws {
        let id = UUID().uuidString
        try sql("""
            INSERT INTO records VALUES('entry','\(id)','\(date)',
            '{"id":"\(id)","date":"\(date)","calories":\(calories),"protein":\(protein),"carbs":\(carbs),"fat":\(fat)}');
            """)
    }

    private func read(at date: Date? = nil, timeZone: TimeZone? = nil) throws -> MacroCheckIn {
        try MacroCheckInReader.read(databaseURL: databaseURL, now: date ?? now, timeZone: timeZone ?? zone)
    }

    func testAggregatesDaysBeforeAveragingAndExcludesTodayAndOutOfRange() throws {
        try entry("2026-09-15", calories: 1000, protein: 100, carbs: 120, fat: 40)
        try entry("2026-09-15", calories: 400, protein: 20, carbs: 30, fat: 10)
        try entry("2026-09-21", calories: 1800, protein: 140, carbs: 210, fat: 70)
        try entry("2026-09-14", calories: 9000)
        try entry("2026-09-22", calories: 9000)
        try entry("2026-09-23", calories: 9000)
        let report = try read()
        XCTAssertEqual(report.startDate, "2026-09-15")
        XCTAssertEqual(report.endDate, "2026-09-21")
        XCTAssertEqual(report.loggedDays, 2)
        XCTAssertEqual(report.averages, MacroAmounts(calories: 1600, protein: 130, carbs: 180, fat: 60))
        XCTAssertTrue(report.dialog.contains("2 of the last 7 completed days"))
        XCTAssertTrue(report.dialog.contains("Logs may be incomplete"))
    }

    func testSavedGoalsAndZeroGoalProduceNumericComparisons() throws {
        try sql("INSERT INTO records VALUES('goals','default',NULL,'{\"calories\":1600,\"protein\":150,\"carbs\":100,\"fat\":0}');")
        try entry("2026-09-21", calories: 1600, protein: 125, carbs: 110, fat: 12)
        let report = try read()
        XCTAssertTrue(report.hasSavedGoals)
        XCTAssertEqual(report.goals.fat, 0)
        XCTAssertTrue(report.dialog.contains("current daily goals"))
        XCTAssertTrue(report.dialog.contains("25 grams under"))
        XCTAssertTrue(report.dialog.contains("10 grams over"))
        XCTAssertTrue(report.dialog.contains("12 grams over"))
        XCTAssertTrue(report.dialog.contains("at your goal"))
        XCTAssertFalse(report.dialog.contains("nan"))
    }

    func testMissingGoalsAreExplicitlyIdentifiedAsDefaults() throws {
        try entry("2026-09-21")
        let report = try read()
        XCTAssertFalse(report.hasSavedGoals)
        XCTAssertEqual(report.goals, MacroAmounts(calories: 2400, protein: 180, carbs: 250, fat: 70))
        XCTAssertTrue(report.dialog.contains("default daily goals"))
    }

    func testNoLoggedDaysDoesNotTreatMissingIntakeAsZero() throws {
        try entry("2026-09-22")
        let report = try read()
        XCTAssertEqual(report.loggedDays, 0)
        XCTAssertNil(report.averages)
        XCTAssertTrue(report.dialog.contains("No food was logged"))
        XCTAssertFalse(report.dialog.contains("under"))
    }

    func testZeroCalorieEntryStillCountsAsALoggedDay() throws {
        try entry("2026-09-21", calories: 0, protein: 0, carbs: 0, fat: 0)
        XCTAssertEqual(try read().loggedDays, 1)
    }

    func testLocalCalendarHandlesMidnightAndDST() throws {
        let instant = ISO8601DateFormatter().date(from: "2026-03-09T03:30:00Z")!
        let report = try read(at: instant)
        XCTAssertEqual(report.startDate, "2026-03-01")
        XCTAssertEqual(report.endDate, "2026-03-07")
        let tokyo = try read(at: instant, timeZone: TimeZone(identifier: "Asia/Tokyo")!)
        XCTAssertEqual(tokyo.startDate, "2026-03-02")
        XCTAssertEqual(tokyo.endDate, "2026-03-08")
    }

    func testMissingDatabaseIsNotCreated() throws {
        let missing = directory.appendingPathComponent("absent.sqlite")
        XCTAssertThrowsError(try MacroCheckInReader.read(databaseURL: missing, now: now, timeZone: zone)) {
            XCTAssertEqual($0 as? MacroCheckInError, .noDiary)
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: missing.path))
    }

    func testUnknownSchemaAndIncompleteInitializationFailClosed() throws {
        for version in [0, 2] {
            try sql("PRAGMA user_version=\(version)")
            XCTAssertThrowsError(try read()) {
                XCTAssertEqual($0 as? MacroCheckInError, version == 0 ? .noDiary : .unsupportedSchema)
            }
        }
    }

    func testMalformedAndNegativeNutritionAreNotSilentlySkipped() throws {
        try sql("INSERT INTO records VALUES('entry','bad','2026-09-21','{\"id\":\"bad\",\"date\":\"2026-09-21\",\"calories\":-20,\"protein\":10,\"carbs\":0,\"fat\":0}');")
        XCTAssertThrowsError(try read()) { XCTAssertEqual($0 as? MacroCheckInError, .invalidData) }
        try sql("UPDATE records SET value='{}';")
        XCTAssertThrowsError(try read()) { XCTAssertEqual($0 as? MacroCheckInError, .invalidData) }
    }

    func testMismatchedEntryIdentityIsRejected() throws {
        try sql("INSERT INTO records VALUES('entry','bad','2026-09-21','{\"id\":\"other\",\"date\":\"2026-09-20\",\"calories\":20,\"protein\":10,\"carbs\":0,\"fat\":0}');")
        XCTAssertThrowsError(try read()) { XCTAssertEqual($0 as? MacroCheckInError, .invalidData) }
    }

    func testReadsCommittedWALDataAndSeesEditsAndReplacement() throws {
        try entry("2026-09-21")
        try sql("BEGIN IMMEDIATE;")
        try entry("2026-09-20", calories: 500)
        XCTAssertEqual(try read().loggedDays, 1)
        try sql("COMMIT;")
        XCTAssertEqual(try read().loggedDays, 2)
        try sql("DELETE FROM records;")
        XCTAssertNil(try read().averages)
    }

    func testTodayBudgetSubtractsOnlyTodaysEntriesFromSavedGoals() throws {
        try sql("INSERT INTO records VALUES('goals','default',NULL,'{\"calories\":2000,\"protein\":150,\"carbs\":220,\"fat\":60}');")
        try entry("2026-09-21", calories: 9000)
        try entry("2026-09-23", calories: 9000)
        try entry("2026-09-22", calories: 1000, protein: 80, carbs: 100, fat: 20)
        try entry("2026-09-22", calories: 400, protein: 20, carbs: 50, fat: 15)
        let budget = try MacroCheckInReader.readToday(databaseURL: databaseURL, now: now, timeZone: zone)
        XCTAssertEqual(budget.date, "2026-09-22")
        XCTAssertEqual(budget.remaining, MacroAmounts(calories: 600, protein: 50, carbs: 70, fat: 25))
        XCTAssertTrue(budget.hasEntries)
        XCTAssertTrue(budget.hasSavedGoals)
    }

    func testTodayBudgetUsesLocalDateAcrossMidnightAndDST() throws {
        let instant = ISO8601DateFormatter().date(from: "2026-03-09T03:30:00Z")!
        try entry("2026-03-08", calories: 100)
        try entry("2026-03-09", calories: 300)
        let local = try MacroCheckInReader.readToday(databaseURL: databaseURL, now: instant, timeZone: zone)
        let tokyo = try MacroCheckInReader.readToday(databaseURL: databaseURL, now: instant, timeZone: TimeZone(identifier: "Asia/Tokyo")!)
        XCTAssertEqual(local.date, "2026-03-08")
        XCTAssertEqual(local.consumed.calories, 100)
        XCTAssertEqual(tokyo.date, "2026-03-09")
        XCTAssertEqual(tokyo.consumed.calories, 300)
    }

    func testTodayBudgetReadsFreshCommittedDataAndDefaults() throws {
        let empty = try MacroCheckInReader.readToday(databaseURL: databaseURL, now: now, timeZone: zone)
        XCTAssertFalse(empty.hasEntries)
        XCTAssertFalse(empty.hasSavedGoals)
        XCTAssertEqual(empty.remaining, .defaults)
        try sql("BEGIN IMMEDIATE;")
        try entry("2026-09-22")
        XCTAssertFalse(try MacroCheckInReader.readToday(databaseURL: databaseURL, now: now, timeZone: zone).hasEntries)
        try sql("COMMIT;")
        XCTAssertEqual(try MacroCheckInReader.readToday(databaseURL: databaseURL, now: now, timeZone: zone).consumed.calories, 100)
        try sql("DELETE FROM records;")
        XCTAssertFalse(try MacroCheckInReader.readToday(databaseURL: databaseURL, now: now, timeZone: zone).hasEntries)
    }

    func testTodayBudgetRejectsInvalidDiaryData() throws {
        try entry("2026-09-22", protein: -1)
        XCTAssertThrowsError(try MacroCheckInReader.readToday(databaseURL: databaseURL, now: now, timeZone: zone)) {
            XCTAssertEqual($0 as? MacroCheckInError, .invalidData)
        }
    }
}
