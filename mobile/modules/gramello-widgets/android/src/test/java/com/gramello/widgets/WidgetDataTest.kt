package com.gramello.widgets

import org.junit.Assert.*
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class WidgetDataTest {
  private fun instant(value: String) = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(value)!!
  private val json = """{"version":1,"status":"ready","date":"2026-03-08","timeZone":"America/New_York","generatedAt":"2026-03-09T03:30:00.000Z","consumed":{"calories":450,"protein":30,"carbs":60,"fat":7.5},"goals":{"calories":400,"protein":0,"carbs":10,"fat":5},"hasFood":true,"hasWater":true,"hasSavedGoals":true,"hasSavedWaterGoal":false,"waterMl":236.5882365,"waterGoalMl":1800,"waterUnit":"fl-oz"}"""
  @Test fun localDayAndUnits() {
    val data = WidgetData.parse(json)
    assertEquals(450.0,data.calories,0.0001)
    assertEquals(8.0,data.waterValue,0.0001)
    assertEquals(100,data.progress(false))
    assertEquals(0,WidgetData.percent(1.0,0.0))
    assertEquals("ready",data.state(instant("2026-03-09T03:30:00Z"),TimeZone.getTimeZone("America/New_York")))
    assertEquals("stale",data.state(instant("2026-03-09T04:00:00Z"),TimeZone.getTimeZone("America/New_York")))
    assertEquals("stale",data.state(instant("2026-03-09T03:30:00Z"),TimeZone.getTimeZone("UTC")))
  }
  @Test fun malformedDataNeverBecomesZeroIntake() {
    for (text in listOf("{}",json.replace("\"version\":1","\"version\":99"),json.replace("\"waterMl\":236.5882365","\"waterMl\":-1"),json.replace("fl-oz","cups"))) {
      assertEquals("unavailable",WidgetData.parse(text).state())
    }
    assertEquals("unavailable",WidgetData.parse("""{"version":1,"status":"unavailable"}""").state())
  }
}
