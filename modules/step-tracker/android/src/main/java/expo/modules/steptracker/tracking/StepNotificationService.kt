package expo.modules.steptracker.tracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.steptracker.R
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

/**
 * Canlı bildirim için `health` türünde foreground service.
 *
 * Yalnızca kullanıcı "Bildirimde göster"i açtıysa, kayıt sürüyorsa ve bildirim izni varsa çalışır.
 * Gizle ya da Durdur ile kapanır. Adım olaylarını ekran kapalıyken biriktirilmiş (batch) alır ve
 * bildirimi en fazla [MIN_UPDATE_INTERVAL_MS] aralıkla günceller; ekran kapalıyken hiç güncellemez,
 * ekran açılınca günceller. Sürekli wake lock tutmaz.
 */
class StepNotificationService : Service() {

  companion object {
    private const val TAG = "StepNotificationService"
    const val CHANNEL_ID = "live_steps"
    const val NOTIFICATION_ID = 4101
    private const val MIN_UPDATE_INTERVAL_MS = 3_000L

    @Volatile var running = false
      private set

    fun start(context: Context) {
      try {
        ContextCompat.startForegroundService(context, Intent(context, StepNotificationService::class.java))
      } catch (e: Exception) {
        // Android 12+ bazı durumlarda arka plandan servis başlatmayı engeller. Kayıt Recording API ile sürer.
        Log.w(TAG, "could not start live notification service", e)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, StepNotificationService::class.java))
    }

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      // Varsayılan önem: bildirim alanında ve (sistem izin veriyorsa) kilit ekranında görünür.
      // Ses ve titreşim kapalı; sayı her güncellendiğinde kullanıcı rahatsız edilmez.
      val channel = NotificationChannel(CHANNEL_ID, "Canlı adım sayacı", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "Bugünkü adım sayısını bildirim alanında gösterir."
        setSound(null, null)
        enableVibration(false)
        enableLights(false)
        setShowBadge(false)
      }
      manager.createNotificationChannel(channel)
    }
  }

  private val engine by lazy { StepEngine.get(this) }
  private var collectJob: Job? = null
  private var lastPostedAt = 0L
  private var lastPosted: Pair<Int, Boolean>? = null
  private var screenReceiverRegistered = false

  /** Ekran kapalıyken atlanan güncellemeyi ekran açılır açılmaz göster. */
  private val screenOnReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      engine.scope.launch {
        engine.state.value?.let { post(it.steps, it.runtime.lockScreenVisible) }
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ensureChannel(this)
    val initial = engine.state.value
    val notification = build(initial?.steps ?: 0, initial?.runtime?.lockScreenVisible ?: false)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      Log.w(TAG, "startForeground not allowed", e)
      stopSelf()
      return START_NOT_STICKY
    }
    running = true

    if (!screenReceiverRegistered) {
      ContextCompat.registerReceiver(
        this, screenOnReceiver, IntentFilter(Intent.ACTION_SCREEN_ON), ContextCompat.RECEIVER_NOT_EXPORTED,
      )
      screenReceiverRegistered = true
    }
    if (collectJob == null) {
      collectJob = engine.scope.launch {
        engine.serviceStarted()
        if (!engine.serviceStillWanted()) {
          stopSelf()
          return@launch
        }
        engine.state.filterNotNull().collect { state ->
          post(state.steps, state.runtime.lockScreenVisible)
        }
      }
    }
    return START_STICKY
  }

  /** Olaylar birleştirilir: en fazla her 3 saniyede bir, yalnızca ekran açıkken ve değer değiştiyse. */
  private suspend fun post(steps: Int, lockScreen: Boolean) {
    val value = steps to lockScreen
    if (value == lastPosted) return
    val power = getSystemService(PowerManager::class.java)
    if (!power.isInteractive) return // Ekran açılınca StepEngine yeni durum yayınlar, o zaman güncellenir.
    val wait = MIN_UPDATE_INTERVAL_MS - (SystemClock.elapsedRealtime() - lastPostedAt)
    if (wait > 0) {
      delay(wait)
      val latest = engine.state.value ?: return
      if ((latest.steps to latest.runtime.lockScreenVisible) != value) return // Daha yeni değer zaten gelecek.
    }
    if (!running) return
    try {
      NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, build(steps, lockScreen))
      lastPosted = value
      lastPostedAt = SystemClock.elapsedRealtime()
    } catch (e: SecurityException) {
      Log.w(TAG, "notification permission revoked", e)
    }
  }

  private fun build(steps: Int, lockScreen: Boolean): Notification {
    val formatted = NumberFormat.getIntegerInstance(Locale.forLanguageTag("tr-TR")).format(steps)
    val openApp = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    // Kilit ekranında yalnızca adım sayısı: profil, kilo ve kalori bilgisi bildirime hiç konmaz.
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_steps)
      .setContentTitle("$formatted adım")
      .setContentText("Bugün")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setVisibility(if (lockScreen) NotificationCompat.VISIBILITY_PUBLIC else NotificationCompat.VISIBILITY_SECRET)
      .addAction(0, "Durdur", NotificationActionReceiver.pendingIntent(this, NotificationActionReceiver.ACTION_STOP))
      .addAction(0, "Gizle", NotificationActionReceiver.pendingIntent(this, NotificationActionReceiver.ACTION_HIDE))
      // Android 14+ kullanıcı bildirimi kaydırarak kapatabilir; bunu Gizle olarak yorumlarız.
      .setDeleteIntent(NotificationActionReceiver.pendingIntent(this, NotificationActionReceiver.ACTION_DISMISSED))
    if (openApp != null) builder.setContentIntent(openApp)
    return builder.build()
  }

  override fun onDestroy() {
    running = false
    if (screenReceiverRegistered) {
      runCatching { unregisterReceiver(screenOnReceiver) }
      screenReceiverRegistered = false
    }
    collectJob?.cancel()
    collectJob = null
    engine.scope.launch { engine.serviceStopped() }
    super.onDestroy()
  }
}
