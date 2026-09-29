package expo.modules.steptracker.data

import android.content.Context
import expo.modules.steptracker.core.TrackingPrefs

/**
 * Küçük ayarlar SharedPreferences'ta tutulur: uygulama arayüzü açık değilken çalışan bildirim eylemleri,
 * açılışta çalışan alıcı ve WorkManager bu değerleri veritabanı açmadan, hızlı ve eşzamanlı okuyabilir.
 * Adım, kilo ve kalori gibi kayıtlar Room'dadır.
 */
class SettingsStore(context: Context) {
  private val prefs = context.getSharedPreferences("step_tracker_settings", Context.MODE_PRIVATE)

  var onboardingDone: Boolean
    get() = prefs.getBoolean("onboardingDone", false)
    set(v) = prefs.edit().putBoolean("onboardingDone", v).apply()

  var lastSyncMillis: Long
    get() = prefs.getLong("lastSyncMillis", 0L)
    set(v) = prefs.edit().putLong("lastSyncMillis", v).apply()

  /** Tek seferlik veri düzeltmelerinin hangisine kadar uygulandığı */
  var dataRevision: Int
    get() = prefs.getInt("dataRevision", 1)
    set(v) {
      prefs.edit().putInt("dataRevision", v).commit()
    }

  /** Tartılma hatırlatıcısı: açık mı, ilk gün (1=Pazartesi ... 7=Pazar; ikinci gün 3 gün sonrası) ve saat */
  var weighReminderEnabled: Boolean
    get() = prefs.getBoolean("weighReminderEnabled", false)
    set(v) {
      prefs.edit().putBoolean("weighReminderEnabled", v).commit()
    }

  var weighReminderFirstDay: Int
    get() = prefs.getInt("weighReminderFirstDay", 1)
    set(v) {
      prefs.edit().putInt("weighReminderFirstDay", v).commit()
    }

  var weighReminderHour: Int
    get() = prefs.getInt("weighReminderHour", 8)
    set(v) {
      prefs.edit().putInt("weighReminderHour", v).commit()
    }

  var recordingSubscribed: Boolean
    get() = prefs.getBoolean("recordingSubscribed", false)
    set(v) = prefs.edit().putBoolean("recordingSubscribed", v).apply()

  var trackingPrefs: TrackingPrefs
    get() = TrackingPrefs(
      trackingEnabled = prefs.getBoolean("trackingEnabled", false),
      // Varsayılanlar kapalı: seçenekler önceden onaylanmış olmasın.
      notificationEnabled = prefs.getBoolean("notificationEnabled", false),
      lockScreenEnabled = prefs.getBoolean("lockScreenEnabled", false),
      hiddenByAction = prefs.getBoolean("hiddenByAction", false),
    )
    set(v) {
      // commit(): bildirim eylemi süreci hemen sonlanabileceği için değer diske yazılmadan dönülmez.
      prefs.edit()
        .putBoolean("trackingEnabled", v.trackingEnabled)
        .putBoolean("notificationEnabled", v.notificationEnabled)
        .putBoolean("lockScreenEnabled", v.lockScreenEnabled)
        .putBoolean("hiddenByAction", v.hiddenByAction)
        .commit()
    }
}
