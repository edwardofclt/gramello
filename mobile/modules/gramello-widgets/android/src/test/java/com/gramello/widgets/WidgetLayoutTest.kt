package com.gramello.widgets

import android.widget.RemoteViews
import android.widget.TextView
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [24, 34])
class WidgetLayoutTest {
  @Test fun everySizeAndPreviewInflatesInARealRemoteViewsHost() {
    val context = RuntimeEnvironment.getApplication()
    for (layout in listOf(R.layout.gramello_widget,R.layout.gramello_widget_wide,R.layout.gramello_widget_preview,R.layout.gramello_water_preview)) {
      val views = RemoteViews(context.packageName,layout)
      views.setTextViewText(R.id.widget_value,"750")
      val root = views.apply(context,null)
      assertEquals("750",root.findViewById<TextView>(R.id.widget_value).text.toString())
    }
  }
  @Test fun unavailableStateReplacesPreviouslySpokenTotals() {
    val context = RuntimeEnvironment.getApplication()
    val now = Date()
    val date = SimpleDateFormat("yyyy-MM-dd",Locale.US).format(now)
    val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(now)
    val data = WidgetData.parse("""{"version":1,"status":"ready","date":"$date","timeZone":"${TimeZone.getDefault().id}","generatedAt":"$timestamp","consumed":{"calories":750,"protein":20,"carbs":50,"fat":10},"goals":{"calories":2000,"protein":150,"carbs":250,"fat":70},"hasFood":true,"hasWater":false,"hasSavedGoals":true,"hasSavedWaterGoal":true,"waterMl":0,"waterGoalMl":2000,"waterUnit":"ml"}""")
    val ready = GramelloWidgetProvider.render(context,data,wide=true,water=false,id=1)
    val root = ready.apply(context,null)
    assertTrue(root.findViewById<TextView>(R.id.widget_value).contentDescription.toString().contains("750"))
    GramelloWidgetProvider.render(context,WidgetData.parse("{}"),wide=true,water=false,id=1).reapply(context,root)
    assertEquals("Open Gramello to refresh your diary",root.findViewById<TextView>(R.id.widget_value).contentDescription.toString())
  }
}
