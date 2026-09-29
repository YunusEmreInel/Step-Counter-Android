package expo.modules.steptracker.core

import java.time.ZoneId
import kotlin.math.max

/**
 * Bugünün adım sayısını tek bir kuralla uzlaştırır.
 *
 * İki kaynak aynı fiziksel adımları farklı zamanlarda bildirir:
 *  - Canlı sensör (TYPE_STEP_DETECTOR): anında gelir ama yalnızca dinlerken sayar.
 *  - Recording API: uygulama kapalıyken de sayar ama gecikmeli okunur.
 *
 * Temel ilke: her iki kaynak da gerçek adım sayısının bir ALT SINIRIDIR (asla fazlasını söylemez).
 * Alt sınırların en büyüğü de bir alt sınırdır. Bu yüzden:
 *  - İki kaynağı TOPLAMAYIZ (aynı adım iki kez sayılırdı), en büyüğünü alırız.
 *  - Gösterilen sayı gün içinde asla azalmaz; geç gelen daha küçük bir Recording değeri görmezden gelinir.
 *
 * Canlı sayım "taban + taban anından sonraki sensör adımları" olarak tutulur. Taban, zamanı bilinen bir
 * alt sınırdır; sensör adımları o andan sonra atıldığı için tabanla çakışmaz, toplamı da alt sınır olur.
 * Recording değeri canlı sayımı geçerse taban Recording değerine çekilir ve canlı sayaç sıfırlanır;
 * böylece ekrandaki sayı sonraki her adımda yine birer birer artar.
 */
class StepReconciler(private val zone: () -> ZoneId = { ZoneId.systemDefault() }) {

  sealed interface LiveResult {
    object Counted : LiveResult
    /** Adım, tabanın zaten kapsadığı bir zamana ait (ör. Başlat'tan önce ya da yeniden başlatmadan önce). */
    object AlreadyCovered : LiveResult
    /** Adım önceki bir güne ait ve geç geldi. Kaybolmaz: o günü Recording API eşitlemesi kapatır. */
    object PreviousDay : LiveResult
    /** Adım yeni bir güne ait; önce gün devri yapılmalı. */
    data class NeedsRollover(val dayKey: String) : LiveResult
    object NotStarted : LiveResult
  }

  var dayKey: String? = null
    private set
  private var baseline = 0
  var baselineAtMillis = 0L
    private set
  private var liveSinceBaseline = 0
  private var recordedTotal = 0

  val displayed: Int
    get() = max(baseline + liveSinceBaseline, recordedTotal)

  /**
   * Yeni bir güne (veya süreç yeniden başladığında bugüne) geçer.
   * @param storedSteps Room'daki günlük toplam (daha önce kalıcı hale gelmiş alt sınır)
   * @param recordedTotal Bu gün için Recording API'den okunmuş toplam
   * @param coveredUntilMillis Bu değerlerin kapsadığı son an; bundan önceki sensör adımları sayılmaz
   */
  fun startDay(key: String, storedSteps: Int, recordedTotal: Int, coveredUntilMillis: Long) {
    dayKey = key
    this.recordedTotal = recordedTotal
    baseline = max(storedSteps, recordedTotal)
    baselineAtMillis = coveredUntilMillis
    liveSinceBaseline = 0
  }

  fun onLiveSteps(count: Int, stepTimeMillis: Long): LiveResult {
    val current = dayKey ?: return LiveResult.NotStarted
    val stepDay = DayKeys.keyOf(stepTimeMillis, zone())
    // ISO tarih dizgileri sözlük sırasıyla karşılaştırılabilir.
    if (stepDay < current) return LiveResult.PreviousDay
    if (stepDay > current) return LiveResult.NeedsRollover(stepDay)
    if (stepTimeMillis < baselineAtMillis) return LiveResult.AlreadyCovered
    liveSinceBaseline += count
    return LiveResult.Counted
  }

  /**
   * Recording API'den gelen günlük toplamı işler.
   * @param coveredUntilMillis Okumanın kapsadığı aralığın sonu
   * @return gösterilen sayı değiştiyse true
   */
  fun onRecordedTotal(total: Int, coveredUntilMillis: Long): Boolean {
    val before = displayed
    recordedTotal = max(recordedTotal, total)
    if (recordedTotal > baseline + liveSinceBaseline) {
      baseline = recordedTotal
      liveSinceBaseline = 0
      baselineAtMillis = max(baselineAtMillis, coveredUntilMillis)
    }
    return displayed != before
  }

  /**
   * Mevcut değeri taban yapar ve `nowMillis` öncesindeki sensör adımlarını reddeder.
   * Başlat'a basıldığında (durdurulan dönemdeki adımlar sayılmasın) ve saat elle değiştirildiğinde kullanılır.
   */
  fun rebase(nowMillis: Long) {
    baseline = displayed
    liveSinceBaseline = 0
    baselineAtMillis = nowMillis
  }
}
