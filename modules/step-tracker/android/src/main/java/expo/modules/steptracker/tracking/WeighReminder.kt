package expo.modules.steptracker.tracking

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.steptracker.R
import expo.modules.steptracker.core.ReminderSchedule
import expo.modules.steptracker.data.SettingsStore
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Haftada iki kez, sabah aç karnına tartılma hatırlatıcısı.
 *
 * Kesin zamanlı alarm (SCHEDULE_EXACT_ALARM) izni istemez: AlarmManager.setWindow ile 30 dakikalık bir pencere
 * verilir, Android pil için alarmı bu pencerede uygun bir ana kaydırabilir. Her hatırlatmadan sonra sıradaki kurulur;
 * telefon yeniden başlayınca ya da saat dilimi değişince BootReceiver yeniden kurar.
 */
object WeighReminder {
  private const val CHANNEL_ID = "weigh_reminder"
  private const val NOTIFICATION_ID = 4102
  private const val WINDOW_MS = 30 * 60 * 1000L

  fun schedule(context: Context) {
    val settings = SettingsStore(context)
    val alarm = context.getSystemService(AlarmManager::class.java)
    val pending = pendingIntent(context)
    alarm.cancel(pending)
    if (!settings.weighReminderEnabled) return
    val next = ReminderSchedule.next(
      ZonedDateTime.now(ZoneId.systemDefault()),
      settings.weighReminderFirstDay,
      settings.weighReminderHour,
    )
    alarm.setWindow(AlarmManager.RTC_WAKEUP, next.toInstant().toEpochMilli(), WINDOW_MS, pending)
  }

  private fun pendingIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      NOTIFICATION_ID,
      Intent(context, WeighReminderReceiver::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  fun show(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Tartılma hatırlatıcısı", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Haftada iki kez sabah tartılmayı hatırlatır."
          }
        )
      }
    }
    // Bildirime dokununca doğrudan Hedef sekmesi açılır.
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("adimsayar://weight")).setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val content = PendingIntent.getActivity(context, NOTIFICATION_ID, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_steps)
      .setContentTitle("Tartılma zamanı")
      .setContentText("Kahvaltıdan önce tartıl ve ölçümünü ekle.")
      .setContentIntent(content)
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      // Kilit ekranında yalnızca "Tartılma zamanı" başlığı; kilo bilgisi zaten bildirimde yok.
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .build()
    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {
      // Bildirim izni yoksa sessizce geç; ayarlarda izin durumu gösteriliyor.
    }
  }
}

class WeighReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (SettingsStore(context).weighReminderEnabled) WeighReminder.show(context)
    WeighReminder.schedule(context)
  }
}
