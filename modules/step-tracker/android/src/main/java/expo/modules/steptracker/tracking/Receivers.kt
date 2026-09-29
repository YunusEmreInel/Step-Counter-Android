package expo.modules.steptracker.tracking

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.launch

/**
 * Bildirimdeki Durdur ve Gizle düğmeleri. Uygulama arayüzü kapalı olsa da çalışır:
 * Android alıcıyı başlatır, goAsync ile işlem bitene kadar süreci canlı tutar.
 */
class NotificationActionReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_STOP = "expo.modules.steptracker.ACTION_STOP"
    const val ACTION_HIDE = "expo.modules.steptracker.ACTION_HIDE"
    const val ACTION_DISMISSED = "expo.modules.steptracker.ACTION_DISMISSED"

    fun pendingIntent(context: Context, action: String): PendingIntent {
      val intent = Intent(context, NotificationActionReceiver::class.java).setAction(action)
      return PendingIntent.getBroadcast(
        context,
        action.hashCode(),
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    val engine = StepEngine.get(context)
    val pending = goAsync()
    engine.scope.launch {
      try {
        when (intent.action) {
          ACTION_STOP -> engine.stop()
          ACTION_HIDE, ACTION_DISMISSED -> engine.hide()
        }
      } catch (e: Exception) {
        Log.e("NotificationAction", "action failed", e)
      } finally {
        pending.finish()
      }
    }
  }
}

/**
 * Telefon yeniden başladığında veya uygulama güncellendiğinde kaydı ve (açıksa) canlı bildirimi geri getirir.
 * Saat ya da saat dilimi değişince yalnızca tartılma hatırlatıcısı yeniden kurulur.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> WeighReminder.schedule(context)
      Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> {
        WeighReminder.schedule(context)
        return
      }
      else -> return
    }
    val engine = StepEngine.get(context)
    val pending = goAsync()
    engine.scope.launch {
      try {
        engine.onBoot()
      } catch (e: Exception) {
        Log.e("BootReceiver", "boot sync failed", e)
      } finally {
        pending.finish()
      }
    }
  }
}
