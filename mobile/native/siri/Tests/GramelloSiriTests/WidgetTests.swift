import Foundation
import SQLite3
import XCTest
@testable import GramelloSiri

final class WidgetTests: XCTestCase {
    func testSummaryUsesLocalDayAndExactWaterAndExpiresAtMidnight() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("diary.sqlite")
        var db: OpaquePointer?
        XCTAssertEqual(sqlite3_open(url.path, &db), SQLITE_OK)
        defer { sqlite3_close(db) }
        let sql = """
        PRAGMA user_version=1;
        CREATE TABLE records(kind TEXT,id TEXT,date TEXT,value TEXT);
        INSERT INTO records VALUES('entry','a','2026-03-08','{"id":"a","date":"2026-03-08","calories":450,"protein":30,"carbs":60,"fat":7.5}');
        INSERT INTO records VALUES('entry','b','2026-03-09','{"id":"b","date":"2026-03-09","calories":900,"protein":60,"carbs":120,"fat":15}');
        INSERT INTO records VALUES('water','w','2026-03-08','{"id":"w","date":"2026-03-08","amountMl":236.5882365}');
        INSERT INTO records VALUES('waterGoal','default',NULL,'{"goalMl":1800,"unit":"fl-oz"}');
        """
        XCTAssertEqual(sqlite3_exec(db, sql, nil, nil, nil), SQLITE_OK)
        let now = ISO8601DateFormatter().date(from:"2026-03-09T03:30:00Z")!
        let zone = TimeZone(identifier:"America/New_York")!
        try WidgetPublisher.publish(databaseURL:url, directory:directory, now:now, timeZone:zone)
        let snapshot = try WidgetSnapshot.load(from:directory.appendingPathComponent("summary.json"))
        XCTAssertEqual(snapshot.consumed.calories,450)
        XCTAssertEqual(snapshot.waterMl,236.5882365)
        XCTAssertEqual(snapshot.waterUnit,"fl-oz")
        XCTAssertTrue(snapshot.hasFood)
        XCTAssertFalse(snapshot.hasSavedGoals)
        XCTAssertTrue(snapshot.hasSavedWaterGoal)
        XCTAssertEqual(snapshot.state(at:now,timeZone:zone),.ready)
        XCTAssertEqual(snapshot.state(at:now.addingTimeInterval(3600),timeZone:zone),.stale)
        XCTAssertEqual(snapshot.state(at:now,timeZone:TimeZone(secondsFromGMT:0)!),.stale)
        XCTAssertEqual(snapshot.nextMidnight(after:now,timeZone:zone).timeIntervalSince(now),1800,accuracy:1)
        XCTAssertEqual(sqlite3_exec(db,"UPDATE records SET value='{}' WHERE kind='water'",nil,nil,nil),SQLITE_OK)
        try WidgetPublisher.publish(databaseURL:url,directory:directory,now:now,timeZone:zone)
        XCTAssertEqual(try WidgetSnapshot.load(from:directory.appendingPathComponent("summary.json")).status,"unavailable")
    }

    func testPublicationCanRecoverFromMissingDiaryAndNeverCreatesOne() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        defer { try? FileManager.default.removeItem(at:directory) }
        let db = directory.appendingPathComponent("missing.sqlite")
        try WidgetPublisher.publish(databaseURL:db,directory:directory)
        XCTAssertFalse(FileManager.default.fileExists(atPath:db.path))
        XCTAssertEqual(try WidgetSnapshot.load(from:directory.appendingPathComponent("summary.json")).status,"unavailable")
        XCTAssertThrowsError(try WidgetSnapshot.load(from:db))
    }

    func testSnapshotValidationAndSafeProgress() throws {
        let snapshot = WidgetSnapshot.empty(now:Date(),timeZone:.current,status:"ready")
        XCTAssertEqual(WidgetSnapshot.progress(2500,goal:2000),1)
        XCTAssertEqual(WidgetSnapshot.progress(1,goal:0),0)
        XCTAssertEqual(WidgetSnapshot.progress(.infinity,goal:2000),0)
        var invalid = snapshot; invalid.version = 99
        XCTAssertThrowsError(try invalid.validate())
        invalid = snapshot; invalid.waterUnit = "cups"
        XCTAssertThrowsError(try invalid.validate())
        invalid = snapshot; invalid.consumed.calories = -1
        XCTAssertThrowsError(try invalid.validate())
    }

    func testConcurrentPublishersAlwaysLeaveACompleteSnapshot() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        defer { try? FileManager.default.removeItem(at:directory) }
        let url = directory.appendingPathComponent("diary.sqlite")
        var db: OpaquePointer?
        XCTAssertEqual(sqlite3_open(url.path,&db),SQLITE_OK)
        XCTAssertEqual(sqlite3_exec(db,"PRAGMA user_version=1; CREATE TABLE records(kind TEXT,id TEXT,date TEXT,value TEXT);",nil,nil,nil),SQLITE_OK)
        sqlite3_close(db)
        DispatchQueue.concurrentPerform(iterations:12) { _ in
            do {
                try WidgetPublisher.publish(databaseURL:url,directory:directory)
                let value = try WidgetSnapshot.load(from:directory.appendingPathComponent("summary.json"))
                XCTAssertEqual(value.status,"ready")
                XCTAssertFalse(value.hasFood)
            } catch { XCTFail("Atomic publication failed: \(error)") }
        }
    }
}
