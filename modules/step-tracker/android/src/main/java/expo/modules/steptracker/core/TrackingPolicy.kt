package expo.modules.steptracker.core

/** Kullanıcının kalıcı tercihleri. */
data class TrackingPrefs(
  val trackingEnabled: Boolean,
  /** "Bildirimde göster" anahtarı */
  val notificationEnabled: Boolean,
  /** "Kilit ekranında göster" anahtarı (bildirim kapalıyken etkisiz) */
  val lockScreenEnabled: Boolean,
  /** Bildirim, bildirimdeki "Gizle" eylemiyle kapatıldı */
  val hiddenByAction: Boolean,
)

/** Cihazın ve izinlerin o anki durumu. */
data class Capabilities(
  val activityPermission: Boolean,
  val notificationPermission: Boolean,
  val hasLiveSensor: Boolean,
  val recordingAvailable: Boolean,
)

/** Tercihlerden türetilen, o anda gerçekten çalışması gereken parçalar. */
data class Runtime(
  val recordingSubscribed: Boolean,
  val liveService: Boolean,
  val uiSensor: Boolean,
  val lockScreenVisible: Boolean,
)

enum class TrackingAction { START, STOP, HIDE, SHOW_NOTIFICATION, DISABLE_NOTIFICATION, LOCK_SCREEN_ON, LOCK_SCREEN_OFF }

/** Tercih değişikliğinin yan etkileri; motor bunları sırayla uygular. */
enum class Effect {
  /** Durdurmadan önce Recording API'deki son veriyi okuyup Room'a yaz. */
  FLUSH_RECORDING,
  PERSIST_LIVE,
  OPEN_SESSION,
  CLOSE_SESSION,
  SUBSCRIBE_RECORDING,
  UNSUBSCRIBE_RECORDING,
  /** Durdurulan dönemdeki adımlar sayılmasın diye canlı sayımın tabanını şimdiye taşı. */
  REBASE_LIVE,
  SCHEDULE_SYNC,
  CANCEL_SYNC,
  SYNC_NOW,
}

data class Transition(val prefs: TrackingPrefs, val effects: List<Effect>)

enum class TrackerStatus { PERMISSION_REQUIRED, UNSUPPORTED, STOPPED, COUNTING }

/**
 * Durdur / Gizle / Başlat kurallarının tamamı burada, Android'den bağımsız olarak tanımlanır.
 * Böylece "Gizle, Durdur ile aynı şey değildir" kuralı birim testleriyle doğrulanabilir.
 */
object TrackingPolicy {

  fun reduce(prefs: TrackingPrefs, action: TrackingAction): Transition = when (action) {
    TrackingAction.START ->
      if (prefs.trackingEnabled) Transition(prefs, emptyList())
      else Transition(
        prefs.copy(trackingEnabled = true),
        listOf(Effect.OPEN_SESSION, Effect.REBASE_LIVE, Effect.SUBSCRIBE_RECORDING, Effect.SCHEDULE_SYNC),
      )

    TrackingAction.STOP ->
      if (!prefs.trackingEnabled) Transition(prefs, emptyList())
      else Transition(
        prefs.copy(trackingEnabled = false),
        // Sıra önemli: önce veriyi kurtar, sonra aboneliği bitir (abonelik bitince Recording verisi okunamaz).
        listOf(
          Effect.FLUSH_RECORDING,
          Effect.PERSIST_LIVE,
          Effect.CLOSE_SESSION,
          Effect.UNSUBSCRIBE_RECORDING,
          Effect.CANCEL_SYNC,
        ),
      )

    // Gizle yalnızca canlı bildirimi (ve ona bağlı servisi) kapatır; kayıt ve abonelik sürer.
    TrackingAction.HIDE -> Transition(
      prefs.copy(notificationEnabled = false, hiddenByAction = true),
      listOf(Effect.PERSIST_LIVE),
    )

    TrackingAction.SHOW_NOTIFICATION -> Transition(
      prefs.copy(notificationEnabled = true, hiddenByAction = false),
      listOf(Effect.SYNC_NOW),
    )

    TrackingAction.DISABLE_NOTIFICATION -> Transition(
      prefs.copy(notificationEnabled = false, hiddenByAction = false),
      listOf(Effect.PERSIST_LIVE),
    )

    TrackingAction.LOCK_SCREEN_ON -> Transition(prefs.copy(lockScreenEnabled = true), emptyList())
    TrackingAction.LOCK_SCREEN_OFF -> Transition(prefs.copy(lockScreenEnabled = false), emptyList())
  }

  fun desiredRuntime(prefs: TrackingPrefs, caps: Capabilities, uiVisible: Boolean): Runtime {
    val canTrack = prefs.trackingEnabled && caps.activityPermission
    val liveService = canTrack && prefs.notificationEnabled && caps.notificationPermission && caps.hasLiveSensor
    return Runtime(
      recordingSubscribed = canTrack && caps.recordingAvailable,
      liveService = liveService,
      uiSensor = canTrack && uiVisible && caps.hasLiveSensor,
      // Kilit ekranı bilgisi bildirimin kendisidir: bildirim yoksa kilit ekranında da sayı yoktur.
      lockScreenVisible = liveService && prefs.lockScreenEnabled,
    )
  }

  fun status(prefs: TrackingPrefs, caps: Capabilities): TrackerStatus = when {
    !caps.activityPermission -> TrackerStatus.PERMISSION_REQUIRED
    !caps.hasLiveSensor && !caps.recordingAvailable -> TrackerStatus.UNSUPPORTED
    !prefs.trackingEnabled -> TrackerStatus.STOPPED
    else -> TrackerStatus.COUNTING
  }
}
