package com.gramello.widgets

import android.content.Context
import android.util.AtomicFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class GramelloWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GramelloWidgets")
    AsyncFunction("publish") { json: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      WidgetStorage.write(context,WidgetData.parse(json))
      GramelloWidgetProvider.refreshAll(context)
    }
  }
}

internal object WidgetStorage {
  private fun file(context: Context) = AtomicFile(File(context.noBackupFilesDir,"gramello-widget-summary.json"))
  @Synchronized fun write(context: Context, data: WidgetData) {
    val file = file(context)
    val stream = file.startWrite()
    try { stream.write(data.raw.toByteArray(Charsets.UTF_8)); file.finishWrite(stream) }
    catch (error: Exception) { file.failWrite(stream); throw error }
  }
  @Synchronized fun read(context: Context): WidgetData {
    return try {
      val storage = file(context)
      if (storage.baseFile.length() > 16384) return WidgetData.parse("")
      WidgetData.parse(storage.openRead().bufferedReader().use { it.readText() })
    } catch (_: Exception) { WidgetData.parse("") }
  }
}
