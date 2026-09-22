import Foundation
import SQLite3
import XCTest
@testable import GramelloSiri

final class DiaryActionsTests: XCTestCase {
    private var directory: URL!
    private var databaseURL: URL { directory.appendingPathComponent("diary.sqlite") }
    private var writer: OpaquePointer?
    private let now = ISO8601DateFormatter().date(from: "2026-03-09T03:30:00Z")!
    private let zone = TimeZone(identifier: "America/New_York")!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        XCTAssertEqual(sqlite3_open(databaseURL.path, &writer), SQLITE_OK)
        try sql("PRAGMA journal_mode=WAL; PRAGMA user_version=1; CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,date TEXT,value TEXT NOT NULL CHECK(json_valid(value)),PRIMARY KEY(kind,id));")
    }

    override func tearDownWithError() throws {
        sqlite3_close(writer)
        try FileManager.default.removeItem(at: directory)
    }

    private func sql(_ text: String) throws {
        guard sqlite3_exec(writer, text, nil, nil, nil) == SQLITE_OK else { throw NSError(domain: "fixture", code: 1) }
    }

    private func rows(_ kind: String) throws -> [[String: Any]] {
        var statement: OpaquePointer?
        XCTAssertEqual(sqlite3_prepare_v2(writer, "SELECT value FROM records WHERE kind='\(kind)' ORDER BY id", -1, &statement, nil), SQLITE_OK)
        defer { sqlite3_finalize(statement) }
        var result: [[String: Any]] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            let text = String(cString: sqlite3_column_text(statement, 0))
            result.append(try XCTUnwrap(JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any]))
        }
        return result
    }

    private func savedMeal() throws {
        try sql("""
        INSERT INTO records VALUES('meal','soup',NULL,'{"id":"soup","name":"Soup","updatedAt":"2026-03-01T12:00:00Z","servingGrams":150,"totalGrams":600,"ingredients":[{"food":{"id":"chicken","name":"Chicken","source":"USDA","servingLabel":"100 g","servingGrams":100,"calories":200,"protein":20,"carbs":10,"fat":5},"quantity":300,"unit":"grams"}]}');
        """)
    }

    func testWaterConvertsUSFluidOuncesAndUsesTodayLocally() throws {
        let amount = try DiaryActions.logWater(databaseURL: databaseURL, amount: 16, unit: .fluidOunces, now: now, timeZone: zone)
        XCTAssertEqual(amount, 473.176473, accuracy: 0.000001)
        let record = try XCTUnwrap(rows("water").first)
        XCTAssertEqual(record["date"] as? String, "2026-03-08")
        XCTAssertEqual(record["amountMl"] as? Double, 473.176473)
        XCTAssertNotNil(record["id"] as? String)
        XCTAssertEqual(record["createdAt"] as? String, "2026-03-09T03:30:00.000Z")
    }

    func testInvalidWaterCannotWriteAndDiaryMustAlreadyExist() throws {
        for amount in [0.0, -1, 0.5, 10001, .infinity, .nan] {
            XCTAssertThrowsError(try DiaryActions.logWater(databaseURL: databaseURL, amount: amount, unit: .milliliters))
        }
        XCTAssertEqual(try rows("water").count, 0)
        let missing = directory.appendingPathComponent("missing.sqlite")
        XCTAssertThrowsError(try DiaryActions.logWater(databaseURL: missing, amount: 250, unit: .milliliters))
        XCTAssertFalse(FileManager.default.fileExists(atPath: missing.path))
    }

    func testSavedMealLogsRequestedServingsUsingMeasuredYield() throws {
        try savedMeal()
        XCTAssertEqual(try DiaryActions.savedMeals(databaseURL: databaseURL).map(\.name), ["Soup"])
        let name = try DiaryActions.logSavedMeal(databaseURL: databaseURL, id: "soup", servings: 2, meal: .lunch, now: now, timeZone: zone)
        XCTAssertEqual(name, "Soup")
        let entry = try XCTUnwrap(rows("entry").first)
        XCTAssertEqual(entry["meal"] as? String, "Lunch")
        XCTAssertEqual(entry["date"] as? String, "2026-03-08")
        XCTAssertEqual(entry["grams"] as? Double, 300)
        XCTAssertEqual(entry["calories"] as? Double, 300)
        XCTAssertEqual(entry["protein"] as? Double, 30)
        XCTAssertEqual(entry["quantity"] as? Double, 2)
        XCTAssertEqual(entry["sourceId"] as? String, "meal-soup")
        XCTAssertEqual(entry["source"] as? String, "My meals")
        XCTAssertEqual(entry["unit"] as? String, "serving")
        XCTAssertEqual(try rows("meal").count, 1)
    }

    func testDeletedMealAndInvalidPortionsDoNotWrite() throws {
        try savedMeal()
        for servings in [0.0, -1, 1000001, .infinity] {
            XCTAssertThrowsError(try DiaryActions.logSavedMeal(databaseURL: databaseURL, id: "soup", servings: servings, meal: .dinner))
        }
        XCTAssertThrowsError(try DiaryActions.logSavedMeal(databaseURL: databaseURL, id: "deleted", servings: 1, meal: .dinner))
        XCTAssertEqual(try rows("entry").count, 0)
    }

    func testRepeatYesterdayCopiesOnlySelectedMealAndKeepsOriginals() throws {
        try savedMeal()
        let yesterday = ISO8601DateFormatter().date(from: "2026-03-07T17:00:00Z")!
        _ = try DiaryActions.logSavedMeal(databaseURL: databaseURL, id: "soup", servings: 1, meal: .lunch, now: yesterday, timeZone: zone)
        _ = try DiaryActions.logSavedMeal(databaseURL: databaseURL, id: "soup", servings: 2, meal: .dinner, now: yesterday, timeZone: zone)
        XCTAssertEqual(try DiaryActions.repeatYesterday(databaseURL: databaseURL, meal: .lunch, now: now, timeZone: zone), 1)
        let entries = try rows("entry")
        XCTAssertEqual(entries.count, 3)
        XCTAssertEqual(Set(entries.compactMap { $0["id"] as? String }).count, 3)
        let today = try XCTUnwrap(entries.first { $0["date"] as? String == "2026-03-08" })
        XCTAssertEqual(today["meal"] as? String, "Lunch")
        XCTAssertEqual(today["calories"] as? Double, 150)
        XCTAssertEqual(today["quantity"] as? Double, 1)
        XCTAssertEqual(try DiaryActions.repeatYesterday(databaseURL: databaseURL, meal: .breakfast, now: now, timeZone: zone), 0)
    }

    func testWritesRejectUnknownSchemaAndBusyTransactionWithoutPartialRecords() throws {
        try sql("PRAGMA user_version=2")
        XCTAssertThrowsError(try DiaryActions.logWater(databaseURL: databaseURL, amount: 250, unit: .milliliters))
        try sql("PRAGMA user_version=1; BEGIN IMMEDIATE;")
        XCTAssertThrowsError(try DiaryActions.logWater(databaseURL: databaseURL, amount: 250, unit: .milliliters))
        try sql("ROLLBACK;")
        XCTAssertEqual(try rows("water").count, 0)
    }

    func testRepeatRollsBackEntireMealWhenAnyInsertFails() throws {
        try savedMeal()
        let yesterday = ISO8601DateFormatter().date(from: "2026-03-07T17:00:00Z")!
        for _ in 0..<2 { _ = try DiaryActions.logSavedMeal(databaseURL: databaseURL, id: "soup", servings: 1, meal: .lunch, now: yesterday, timeZone: zone) }
        try sql("CREATE TRIGGER reject_second BEFORE INSERT ON records WHEN NEW.kind='entry' AND NEW.date='2026-03-08' AND (SELECT COUNT(*) FROM records WHERE kind='entry' AND date='2026-03-08')=1 BEGIN SELECT RAISE(ABORT,'fixture'); END;")
        XCTAssertThrowsError(try DiaryActions.repeatYesterday(databaseURL: databaseURL, meal: .lunch, now: now, timeZone: zone))
        XCTAssertEqual(try rows("entry").count, 2)
    }

    func testTodaySummaryAndRemainingAmountsIdentifyExceededGoals() {
        let day = DailyMacroBudget(date: "2026-03-08", consumed: MacroAmounts(calories: 2100, protein: 120, carbs: 200, fat: 50), goals: MacroAmounts(calories: 2000, protein: 150, carbs: 220, fat: 60), hasEntries: true, hasSavedGoals: true)
        XCTAssertTrue(day.remainingDialog.contains("100 calories over"))
        XCTAssertTrue(day.remainingDialog.contains("30 grams protein remaining"))
        XCTAssertTrue(day.summaryDialog(metric: .protein).contains("120 grams protein"))
        XCTAssertFalse(day.summaryDialog(metric: .protein).contains("2,100"))
        XCTAssertTrue(day.summaryDialog(metric: .all).contains("2,100 calories"))
    }

    func testFractionalLoggingAmountsAreNotReportedAsZeroOrAnotherPortion() {
        XCTAssertEqual(diaryAmount(0.04), "0.04")
        XCTAssertEqual(diaryAmount(1.25), "1.25")
        XCTAssertEqual(diaryAmount(0.125), "0.125")
    }

    func testRepeatRejectsIncompleteEntryWithoutWritingAnything() throws {
        try sql("""
        INSERT INTO records VALUES('entry','missing-grams','2026-03-07','{"id":"missing-grams","date":"2026-03-07","createdAt":"2026-03-07T17:00:00Z","meal":"Lunch","name":"Soup","source":"My meals","quantity":1,"unit":"serving","calories":150,"protein":15,"carbs":7.5,"fat":3.75}');
        """)
        XCTAssertThrowsError(try DiaryActions.repeatYesterday(databaseURL: databaseURL, meal: .lunch, now: now, timeZone: zone))
        XCTAssertEqual(try rows("entry").count, 1)
    }
}
