package com.gramello.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews

open class GramelloWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val water = this is WaterWidgetProvider
    for (id in ids) update(context,manager,id,water)
  }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    update(context,manager,id,this is WaterWidgetProvider)
  }
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context,intent)
    if (intent.action in listOf(Intent.ACTION_TIME_CHANGED,Intent.ACTION_TIMEZONE_CHANGED)) refreshAll(context)
  }
  companion object {
    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      for (type in listOf(TodayWidgetProvider::class.java,WaterWidgetProvider::class.java)) {
        for (id in manager.getAppWidgetIds(ComponentName(context,type))) update(context,manager,id,type == WaterWidgetProvider::class.java)
      }
    }
    private fun update(context: Context, manager: AppWidgetManager, id: Int, water: Boolean) {
      val data = WidgetStorage.read(context)
      val wide = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) >= 250
      manager.updateAppWidget(id,render(context,data,wide,water,id))
    }
    internal fun render(context: Context, data: WidgetData, wide: Boolean, water: Boolean, id: Int): RemoteViews {
      val views = RemoteViews(context.packageName,if (wide && !water) R.layout.gramello_widget_wide else R.layout.gramello_widget)
      views.setTextViewText(R.id.widget_title,if (water) "WATER" else "GRAMELLO")
      if (data.state() == "ready") {
        val value = if (water) data.waterValue else data.calories
        val goal = if (water) data.waterGoal else data.calorieGoal
        val unit = if (water) data.waterLabel else "kcal"
        views.setTextViewText(R.id.widget_value,WidgetData.number(value))
        views.setTextViewText(R.id.widget_goal,"of ${WidgetData.number(goal)} $unit")
        views.setProgressBar(R.id.widget_progress,100,data.progress(water),false)
        views.setViewVisibility(R.id.widget_progress,View.VISIBLE)
        val saved = data.flag(if (water) "hasSavedWaterGoal" else "hasSavedGoals")
        val logged = data.flag(if (water) "hasWater" else "hasFood")
        views.setTextViewText(R.id.widget_status,if (!logged) "Nothing logged" else if (!saved) "Default goal" else "Logged today")
        views.setContentDescription(R.id.widget_value,"${if(water) "Water" else "Calories"}: ${WidgetData.number(value)} $unit logged; ${if(saved) "goal" else "default goal"} ${WidgetData.number(goal)} $unit")
        val time = data.updatedTime()
        views.setTextViewText(R.id.widget_updated,"${data.date} · $time")
        if (wide && !water) {
          val macros = listOf("protein","carbs","fat").joinToString("\n") { key -> "${key.replaceFirstChar { it.uppercase() }}   ${WidgetData.number(data.consumed(key))}/${WidgetData.number(data.goal(key))}g" }
          views.setTextViewText(R.id.widget_macros,macros)
          views.setTextViewText(R.id.widget_water,"Water  ${WidgetData.number(data.waterValue)} ${data.waterLabel}")
        }
      } else {
        views.setTextViewText(R.id.widget_value,"Open app")
        views.setContentDescription(R.id.widget_value,"Open Gramello to refresh your diary")
        views.setTextViewText(R.id.widget_goal,"Tap to refresh your diary")
        views.setTextViewText(R.id.widget_status,"")
        views.setTextViewText(R.id.widget_updated,if (data.date.isEmpty()) "Gramello" else "Last log: ${data.date}")
        views.setViewVisibility(R.id.widget_progress,View.GONE)
        if (wide && !water) { views.setTextViewText(R.id.widget_macros,""); views.setTextViewText(R.id.widget_water,"") }
      }
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (launch != null) {
        launch.action = Intent.ACTION_VIEW; launch.data = Uri.parse("nourish://diary/today")
        launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        views.setOnClickPendingIntent(R.id.widget_root,PendingIntent.getActivity(context,id,launch,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      return views
    }
  }
}
class TodayWidgetProvider : GramelloWidgetProvider()
class WaterWidgetProvider : GramelloWidgetProvider()
