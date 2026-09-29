package expo.modules.steptracker.tracking

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.steptracker.core.Capabilities
import expo.modules.steptracker.core.DayKeys
import expo.modules.steptracker.core.Effect
import expo.modules.steptracker.core.ReadWindow
import expo.modules.steptracker.core.Runtime
import expo.modules.steptracker.core.SessionWindow
import expo.modules.steptracker.core.StepReconciler
import expo.modules.steptracker.core.SyncPlanner
import expo.modules.steptracker.core.TrackerStatus
import expo.modules.steptracker.core.TrackingAction
import expo.modules.steptracker.core.TrackingPolicy
import expo.modules.steptracker.core.TrackingPrefs
import expo.modules.steptracker.data.DailyStepsEntity
import expo.modules.steptracker.data.SettingsStore
import expo.modules.steptracker.data.StepDatabase
import expo.modules.steptracker.data.TrackingSessionEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.time.ZoneId

data class TrackerState(
  val date: String,
  val steps: Int,
  val status: TrackerStatus,
  val prefs: TrackingPrefs,
  val caps: Capabilities,
  val runtime: Runtime,
  val recordingAvailability: RecordingAvailability,
  /** "counter" | "detector" | "none" */
  val liveSensor: String,
  val onboardingDone: Boolean,
  val liveServiceRunning: Boolean,
  val lastSyncMillis: Long,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "date" to date,
    "steps" to steps,
    "status" to status.name.lowercase(),
    "trackingEnabled" to prefs.trackingEnabled,
    "notificationEnabled" to prefs.notificationEnabled,
    "lockScreenEnabled" to prefs.lockScreenEnabled,
    "hiddenByAction" to prefs.hiddenByAction,
    "activityPermission" to caps.activityPermission,
    "notificationPermission" to caps.notificationPermission,
    "hasLiveSensor" to caps.hasLiveSensor,
    "liveSensor" to liveSensor,
    "recording" to recordingAvailability.name.lowercase(),
    "recordingActive" to runtime.recordingSubscribed,
    "lockScreenVisible" to runtime.lockScreenVisible,
    "liveServiceRunning" to liveServiceRunning,
    "onboardingDone" to onboardingDone,
    "lastSyncMillis" to lastSyncMillis.toDouble(),
  )
}

/**
 * Uygulamanın adım motoru. Süreç başına tek örnek vardır ve uygulama arayüzü, canlı bildirim servisi,
 * bildirim eylemleri, açılış alıcısı ve WorkManager aynı örneği kullanır. Böylece "bugün kaç adım"
 * sorusunun tek bir cevabı olur.
 *
 * Tüm durum değişiklikleri tek iş parçacıklı bir dispatcher üzerinde ve [lock] altında yapılır.
 */
class StepEngine private constructor(private val app: Context) {

  companion object {
    private const val TAG = "StepEngine"
    /** Canlı sayım bu kadar adımda bir ya da [PERSIST_DELAY_MS] sonra veritabanına yazılır. */
    private const val PERSIST_EVERY_STEPS = 50
    private const val PERSIST_DELAY_MS = 30_000L
    /** Canlı bildirim açıkken ekran kapalıyken sensör olayları en fazla bu kadar biriktirilebilir. */
    private const val SERVICE_SENSOR_LATENCY_US = 10_000_000
    /** Ekran her açıldığında değil, en az bu aralıkla Recording API'den okunur. */
    private const val SCREEN_ON_SYNC_INTERVAL_MS = 10 * 60 * 1000L
    private const val FLUSH_TIMEOUT_MS = 8_000L
    private const val DATA_REVISION = 2

    @Volatile private var instance: StepEngine? = null

    fun get(context: Context): StepEngine =
      instance ?: synchronized(this) {
        instance ?: StepEngine(context.applicationContext).also { instance = it }
      }
  }

  @OptIn(ExperimentalCoroutinesApi::class)
  private val dispatcher = Dispatchers.Default.limitedParallelism(1)
  val scope = CoroutineScope(SupervisorJob() + dispatcher)
  private val lock = Mutex()

  private val db = StepDatabase.get(app)
  private val dao = db.stepDao()
  val healthDao = db.healthDao()
  val settings = SettingsStore(app)
  private val recording = RecordingSource(app)
  private val sensor = LiveStepSensor(app) { count, time -> scope.launch { handleLiveSteps(count, time) } }
  private val reconciler = StepReconciler { zone() }

  private var prefs: TrackingPrefs = settings.trackingPrefs
  private var caps: Capabilities? = null
  private var runtime: Runtime? = null
  private var recordingAvailability = RecordingAvailability.UNAVAILABLE
  private var loaded = false
  private var uiVisible = false
  private var serviceActive = false
  private var pendingPersistSteps = 0
  private var persistJob: Job? = null
  private var midnightJob: Job? = null
  private var receiverRegistered = false
  /** Geçmiş silindiğinde artar; o sırada sürmekte olan eşitlemenin eski sonuçları yazılmaz. */
  private var generation = 0

  private val _state = MutableStateFlow<TrackerState?>(null)
  val state: StateFlow<TrackerState?> = _state

  private fun now() = System.currentTimeMillis()
  private fun zone(): ZoneId = ZoneId.systemDefault()

  private suspend fun <T> onEngine(block: suspend () -> T): T = withContext(dispatcher) { block() }

  // ---------------------------------------------------------------------------------------------
  // Dışarıya açık işlemler
  // ---------------------------------------------------------------------------------------------

  suspend fun snapshot(): TrackerState = onEngine {
    lock.withLock {
      ensureLoadedLocked()
      checkRolloverLocked(now())
      applyRuntimeLocked()
    }
    _state.value!!
  }

  suspend fun setUiVisible(visible: Boolean) = onEngine {
    lock.withLock {
      uiVisible = visible
      ensureLoadedLocked()
      checkRolloverLocked(now())
      if (!visible) persistLocked()
      applyRuntimeLocked()
    }
    // Uygulama öne gelince (açılış, arka plandan dönüş, yeniden başlatma sonrası) kayıtlı toplamla eşitle.
    if (visible) syncInternal()
  }

  suspend fun start() = perform(TrackingAction.START)
  suspend fun stop() = perform(TrackingAction.STOP)
  suspend fun hide() = perform(TrackingAction.HIDE)
  suspend fun setNotificationEnabled(enabled: Boolean) =
    perform(if (enabled) TrackingAction.SHOW_NOTIFICATION else TrackingAction.DISABLE_NOTIFICATION)
  suspend fun setLockScreenEnabled(enabled: Boolean) =
    perform(if (enabled) TrackingAction.LOCK_SCREEN_ON else TrackingAction.LOCK_SCREEN_OFF)

  suspend fun completeOnboarding() = onEngine {
    settings.onboardingDone = true
    lock.withLock { applyRuntimeLocked() }
  }

  /** WorkManager, açılış alıcısı ve arayüz buradan eşitleme ister. */
  suspend fun sync(): Boolean = onEngine { syncInternal() }

  suspend fun onBoot() = onEngine {
    lock.withLock {
      ensureLoadedLocked()
      if (prefs.trackingEnabled) SyncScheduler.schedule(app)
      applyRuntimeLocked()
    }
    syncInternal()
  }

  suspend fun serviceStarted() = onEngine {
    lock.withLock {
      serviceActive = true
      ensureLoadedLocked()
      sensor.setClient("service", SERVICE_SENSOR_LATENCY_US)
      updateActiveHooksLocked()
      publishLocked()
    }
  }

  suspend fun serviceStopped() = onEngine {
    lock.withLock {
      serviceActive = false
      sensor.setClient("service", null)
      persistLocked()
      updateActiveHooksLocked()
      publishLocked()
    }
  }

  /** Servis kendini başlatabildi mi? Tercihler artık servisi istemiyorsa false. */
  suspend fun serviceStillWanted(): Boolean = onEngine {
    lock.withLock {
      applyRuntimeLocked()
      runtime?.liveService == true
    }
  }

  suspend fun days(from: String, to: String): List<DailyStepsEntity> = onEngine {
    lock.withLock {
      ensureLoadedLocked()
      checkRolloverLocked(now())
      val rows = dao.range(from, to).associateBy { it.date }.toMutableMap()
      // Bugünün satırı en fazla birkaç saniye geride olabilir; canlı değerle tamamla.
      val today = reconciler.dayKey
      if (today != null && today >= from && today <= to) {
        val existing = rows[today]
        if (existing == null || existing.steps < reconciler.displayed) {
          rows[today] = DailyStepsEntity(today, reconciler.displayed, now())
        }
      }
      rows.values.sortedBy { it.date }
    }
  }

  /** Adım geçmişini siler. Kayıt sürüyorsa yeni dönem şimdiden başlar; eski adımlar geri gelmez. */
  suspend fun deleteStepHistory() = onEngine {
    lock.withLock {
      generation++
      val now = now()
      dao.clearDays()
      dao.clearSegments()
      dao.clearClosedSessions()
      dao.restartOpenSessions(now)
      reconciler.startDay(DayKeys.keyOf(now, zone()), 0, 0, now)
      pendingPersistSteps = 0
      publishLocked()
    }
  }

  suspend fun deleteAllData() = onEngine {
    deleteStepHistory()
    healthDao.clearWeights()
    healthDao.clearIntake()
    healthDao.clearProfile()
  }

  fun refreshInBackground() {
    scope.launch { lock.withLock { applyRuntimeLocked() } }
  }

  // ---------------------------------------------------------------------------------------------
  // Tercih geçişleri (Başlat / Durdur / Gizle ...)
  // ---------------------------------------------------------------------------------------------

  private suspend fun perform(action: TrackingAction): TrackerState = onEngine {
    val transition = lock.withLock {
      ensureLoadedLocked()
      TrackingPolicy.reduce(prefs, action)
    }
    if (Effect.FLUSH_RECORDING in transition.effects) {
      // Durdurmadan önce: abonelik bitince Recording verisi okunamaz, bu yüzden son hali şimdi Room'a alınır.
      withTimeoutOrNull(FLUSH_TIMEOUT_MS) { syncInternal() }
    }
    lock.withLock {
      val now = now()
      checkRolloverLocked(now)
      for (effect in transition.effects) {
        when (effect) {
          Effect.FLUSH_RECORDING, Effect.SYNC_NOW -> Unit
          Effect.PERSIST_LIVE -> persistLocked()
          Effect.OPEN_SESSION -> {
            dao.closeAllOpenSessions(now)
            dao.insertSession(TrackingSessionEntity(startMillis = now, endMillis = null))
          }
          Effect.CLOSE_SESSION -> dao.closeAllOpenSessions(now)
          Effect.SUBSCRIBE_RECORDING -> subscribeIfPossibleLocked()
          Effect.UNSUBSCRIBE_RECORDING -> {
            runCatching { recording.unsubscribe() }.onFailure { Log.w(TAG, "unsubscribe failed", it) }
            settings.recordingSubscribed = false
          }
          Effect.REBASE_LIVE -> reconciler.rebase(now)
          Effect.SCHEDULE_SYNC -> SyncScheduler.schedule(app)
          Effect.CANCEL_SYNC -> SyncScheduler.cancel(app)
        }
      }
      prefs = transition.prefs
      settings.trackingPrefs = prefs
      applyRuntimeLocked()
    }
    if (Effect.SYNC_NOW in transition.effects) syncInternal()
    _state.value!!
  }

  // ---------------------------------------------------------------------------------------------
  // Canlı sensör
  // ---------------------------------------------------------------------------------------------

  private suspend fun handleLiveSteps(count: Int, stepTimeMillis: Long) = lock.withLock {
    if (!prefs.trackingEnabled) return@withLock
    ensureLoadedLocked()
    checkRolloverLocked(now())
    when (val result = reconciler.onLiveSteps(count, stepTimeMillis)) {
      StepReconciler.LiveResult.Counted -> {
        publishLocked()
        pendingPersistSteps += count
        if (pendingPersistSteps >= PERSIST_EVERY_STEPS) {
          persistLocked()
        } else if (persistJob?.isActive != true) {
          persistJob = scope.launch {
            delay(PERSIST_DELAY_MS)
            lock.withLock { persistLocked() }
          }
        }
      }
      is StepReconciler.LiveResult.NeedsRollover ->
        Log.w(TAG, "step from the future day ${result.dayKey} ignored (clock skew)")
      else -> Unit
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Recording API eşitlemesi
  // ---------------------------------------------------------------------------------------------

  private suspend fun syncInternal(): Boolean {
    val plan: Pair<Int, List<ReadWindow>> = lock.withLock {
      ensureLoadedLocked()
      val now = now()
      checkRolloverLocked(now)
      if (!hasActivityPermission() || !settings.recordingSubscribed ||
        recording.availability() != RecordingAvailability.AVAILABLE
      ) {
        return false
      }
      val sessions = dao.sessionsEndingAfter(now - SyncPlanner.RETENTION_MILLIS)
        .map { SessionWindow(it.id, it.startMillis, it.endMillis) }
      val finalized = mutableSetOf<String>()
      for (s in sessions) {
        for (key in DayKeys.range(DayKeys.keyOf(maxOf(s.startMillis, now - SyncPlanner.RETENTION_MILLIS), zone()), DayKeys.keyOf(now, zone()))) {
          if (dao.isFinalized(s.id, key)) finalized.add("${s.id}|$key")
        }
      }
      generation to SyncPlanner.plan(sessions, now, zone()) { id, key -> "$id|$key" in finalized }
    }
    val (gen, windows) = plan

    // Okumalar kilit dışında yapılır; bu sırada canlı adımlar ekrana gelmeye devam eder.
    val results = mutableListOf<Pair<ReadWindow, Int>>()
    for (w in windows) {
      try {
        results.add(w to recording.readSteps(w.startMillis, w.endMillis))
      } catch (e: Exception) {
        Log.w(TAG, "Recording read failed for ${w.dayKey}", e)
      }
    }

    lock.withLock {
      if (gen != generation) return false
      val now = now()
      for ((w, steps) in results) {
        dao.mergeSegment(w.sessionId, w.dayKey, steps, w.finalizeAfterRead, now)
        val total = dao.recordedTotal(w.dayKey)
        dao.raiseTo(w.dayKey, total, now)
        if (w.dayKey == reconciler.dayKey) reconciler.onRecordedTotal(total, w.endMillis)
      }
      if (results.isNotEmpty() || windows.isEmpty()) settings.lastSyncMillis = now
      persistLocked()
      publishLocked()
    }
    return results.isNotEmpty()
  }

  private suspend fun subscribeIfPossibleLocked() {
    if (!hasActivityPermission()) return
    if (recording.availability() != RecordingAvailability.AVAILABLE) return
    try {
      recording.subscribe()
      settings.recordingSubscribed = true
    } catch (e: Exception) {
      Log.w(TAG, "Recording API subscribe failed", e)
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Gün devri, kalıcılık, çalışma zamanı
  // ---------------------------------------------------------------------------------------------

  private suspend fun ensureLoadedLocked() {
    if (loaded) return
    prefs = settings.trackingPrefs
    if (settings.dataRevision < DATA_REVISION) {
      // 1. sürümde canlı sayım step detector ile yapılıyordu ve yanlış pozitifler günlük toplamı şişirebiliyordu.
      // Recording API verisi olan günler, donanım sayacının filtrelenmiş değerine bir kez düzeltilir.
      dao.resetDaysToRecorded(now())
      settings.dataRevision = DATA_REVISION
    }
    loadDayLocked(DayKeys.keyOf(now(), zone()), now())
    loaded = true
  }

  private suspend fun loadDayLocked(key: String, now: Long) {
    val stored = dao.getSteps(key) ?: 0
    val recorded = dao.recordedTotal(key)
    // Hiç kayıt yoksa günün başından itibaren gelen sensör adımları kabul edilir; varsa kayıt
    // şimdiye kadarını kapsıyor sayılır ve yalnızca bundan sonraki adımlar eklenir.
    val coveredUntil = if (stored == 0 && recorded == 0) DayKeys.startOfDayMillis(key, zone()) else now
    reconciler.startDay(key, stored, recorded, coveredUntil)
  }

  /** Yerel tarih değiştiyse önceki günü kaydeder ve yeni günü (genellikle 0) yükler. */
  private suspend fun checkRolloverLocked(now: Long): Boolean {
    val key = DayKeys.keyOf(now, zone())
    if (key == reconciler.dayKey) return false
    if (reconciler.dayKey != null) persistLocked()
    loadDayLocked(key, now)
    publishLocked()
    return true
  }

  private suspend fun persistLocked() {
    val key = reconciler.dayKey ?: return
    if (reconciler.displayed > 0) dao.raiseTo(key, reconciler.displayed, now())
    pendingPersistSteps = 0
  }

  private suspend fun applyRuntimeLocked() {
    recordingAvailability = recording.availability()
    val c = Capabilities(
      activityPermission = hasActivityPermission(),
      notificationPermission = NotificationManagerCompat.from(app).areNotificationsEnabled(),
      hasLiveSensor = sensor.hasSensor,
      recordingAvailable = recordingAvailability == RecordingAvailability.AVAILABLE,
    )
    val rt = TrackingPolicy.desiredRuntime(prefs, c, uiVisible)
    caps = c
    runtime = rt
    // İzin sonradan verildiyse ya da Play hizmetleri güncellendiyse aboneliği şimdi başlat.
    if (rt.recordingSubscribed && !settings.recordingSubscribed) subscribeIfPossibleLocked()
    sensor.setClient("ui", if (rt.uiSensor) 0 else null)
    if (rt.liveService && !StepNotificationService.running) StepNotificationService.start(app)
    if (!rt.liveService && StepNotificationService.running) StepNotificationService.stop(app)
    updateActiveHooksLocked()
    publishLocked()
  }

  private fun publishLocked() {
    val key = reconciler.dayKey ?: return
    val c = caps ?: return
    val rt = runtime ?: return
    _state.value = TrackerState(
      date = key,
      steps = reconciler.displayed,
      status = TrackingPolicy.status(prefs, c),
      prefs = prefs,
      caps = c,
      runtime = rt,
      recordingAvailability = recordingAvailability,
      liveSensor = when {
        sensor.usesCounter -> "counter"
        sensor.hasSensor -> "detector"
        else -> "none"
      },
      onboardingDone = settings.onboardingDone,
      liveServiceRunning = StepNotificationService.running,
      lastSyncMillis = settings.lastSyncMillis,
    )
  }

  private fun hasActivityPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
      ContextCompat.checkSelfPermission(app, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

  // ---------------------------------------------------------------------------------------------
  // Gece yarısı ve saat değişimi: yalnızca arayüz ya da canlı servis açıkken dinlenir
  // ---------------------------------------------------------------------------------------------

  private val timeReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val action = intent.action
      scope.launch {
        when (action) {
          Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> lock.withLock {
            val now = now()
            persistLocked()
            checkRolloverLocked(now)
            // Saat elle geri alınırsa adım zamanları tabanın gerisinde kalıp reddedilmesin.
            reconciler.rebase(now)
            publishLocked()
          }
          Intent.ACTION_DATE_CHANGED -> lock.withLock { checkRolloverLocked(now()) }
          Intent.ACTION_SCREEN_ON -> {
            lock.withLock { checkRolloverLocked(now()) }
            if (serviceActive && now() - settings.lastSyncMillis > SCREEN_ON_SYNC_INTERVAL_MS) syncInternal()
          }
        }
      }
    }
  }

  private fun updateActiveHooksLocked() {
    val active = uiVisible || serviceActive
    if (active && !receiverRegistered) {
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_TIME_CHANGED)
        addAction(Intent.ACTION_TIMEZONE_CHANGED)
        addAction(Intent.ACTION_DATE_CHANGED)
        addAction(Intent.ACTION_SCREEN_ON)
      }
      ContextCompat.registerReceiver(app, timeReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
      receiverRegistered = true
      midnightJob = scope.launch {
        while (isActive) {
          val now = now()
          // Gece yarısında hiç adım atılmasa da ekranda ve bildirimde yeni günün 0'ı görünsün.
          delay(DayKeys.nextMidnightMillis(now, zone()) - now + 1_000)
          lock.withLock { checkRolloverLocked(now()) }
        }
      }
    } else if (!active && receiverRegistered) {
      runCatching { app.unregisterReceiver(timeReceiver) }
      receiverRegistered = false
      midnightJob?.cancel()
      midnightJob = null
    }
  }
}
