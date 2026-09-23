package com.gramello.widgets

import org.json.JSONObject
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.text.ParsePosition
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal class WidgetData private constructor(private val value: JSONObject) {
  val raw: String get() = value.toString()
  val date: String get() = value.optString("date", "")
  val generatedAt: String get() = value.optString("generatedAt", "")
  val calories: Double get() = consumed("calories")
  val calorieGoal: Double get() = goal("calories")
  val waterMl: Double get() = value.optDouble("waterMl", 0.0)
  val waterGoalMl: Double get() = value.optDouble("waterGoalMl", 2000.0)
  val waterValue: Double get() = waterMl / divisor
  val waterGoal: Double get() = waterGoalMl / divisor
  val waterLabel: String get() = if (divisor == 1.0) "mL" else "US fl oz"
  private val divisor: Double get() = if (value.optString("waterUnit") == "fl-oz") 29.5735295625 else 1.0
  fun consumed(key: String): Double = value.optJSONObject("consumed")?.optDouble(key, 0.0) ?: 0.0
  fun goal(key: String): Double = value.optJSONObject("goals")?.optDouble(key, 0.0) ?: 0.0
  fun flag(key: String): Boolean = value.optBoolean(key, false)
  fun progress(water: Boolean): Int = if (water) percent(waterMl,waterGoalMl) else percent(calories,calorieGoal)

  fun state(now: Date = Date(), zone: TimeZone = TimeZone.getDefault()): String {
    if (value.optString("status") != "ready") return "unavailable"
    // Equivalent zone aliases (e.g. Asia/Calcutta and Asia/Kolkata) are valid.
    return if (day(now,zone) == date && TimeZone.getTimeZone(value.getString("timeZone")).hasSameRules(zone)) "ready" else "stale"
  }
  fun updatedTime(): String = SimpleDateFormat("HH:mm",Locale.getDefault()).format(timestamp(generatedAt))
  companion object {
    private fun day(date: Date, zone: TimeZone) = SimpleDateFormat("yyyy-MM-dd",Locale.US).apply { timeZone = zone }.format(date)
    private fun timestamp(value: String): Date {
      val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US).apply { isLenient = false; timeZone = TimeZone.getTimeZone("UTC") }
      val position = ParsePosition(0)
      val parsed = formatter.parse(value,position)
      require(parsed != null && position.index == value.length)
      return parsed
    }
    fun number(value: Double): String = NumberFormat.getNumberInstance().apply { maximumFractionDigits = 1 }.format(value)
    fun percent(value: Double, goal: Double): Int = if (!value.isFinite() || !goal.isFinite() || goal <= 0) 0 else (value / goal * 100).coerceIn(0.0,100.0).toInt()
    fun parse(text: String): WidgetData {
      try {
        require(text.length <= 16384)
        val json = JSONObject(text)
        require(json.getInt("version") == 1 && json.getString("status") == "ready")
        val zoneId = json.getString("timeZone")
        require(zoneId in TimeZone.getAvailableIDs())
        val zone = TimeZone.getTimeZone(zoneId)
        require(day(timestamp(json.getString("generatedAt")),zone) == json.getString("date"))
        for (key in listOf("calories","protein","carbs","fat")) {
          for (objectKey in listOf("consumed","goals")) {
            val n = json.getJSONObject(objectKey).getDouble(key)
            require(n.isFinite() && n >= 0)
            if (objectKey == "goals") require(n <= if (key == "calories") 100000.0 else 1e12)
          }
        }
        require(json.getJSONObject("goals").getDouble("calories") > 0)
        require(json.getDouble("waterMl").isFinite() && json.getDouble("waterMl") >= 0)
        require(json.getDouble("waterGoalMl") in 1.0..10000.0)
        require(json.getString("waterUnit") in listOf("ml","fl-oz"))
        for (key in listOf("hasFood","hasWater","hasSavedGoals","hasSavedWaterGoal")) json.getBoolean(key)
        return WidgetData(json)
      } catch (_: Exception) { return WidgetData(JSONObject("""{"version":1,"status":"unavailable"}""")) }
    }
  }
}
