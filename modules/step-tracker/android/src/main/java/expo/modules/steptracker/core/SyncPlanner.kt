package expo.modules.steptracker.core

import java.time.ZoneId
import kotlin.math.max
import kotlin.math.min

/** Bir kayıt dönemi: kullanıcı Başlat'a bastığı andan Durdur'a bastığı ana kadar. */
data class SessionWindow(val id: Long, val startMillis: Long, val endMillis: Long?)

/** Recording API'den okunacak tek parça: bir oturumun tek bir yerel güne düşen kısmı. */
data class ReadWindow(
  val sessionId: Long,
  val dayKey: String,
  val startMillis: Long,
  val endMillis: Long,
  /** Bu okumadan sonra parça bir daha değişmeyecek kadar eski mi? */
  val finalizeAfterRead: Boolean,
)

/**
 * Recording API'den hangi aralıkların okunacağına karar verir.
 *
 * - Yalnızca oturum içindeki zaman okunur: durdurulan dönemdeki adımlar asla kaydedilmiş gibi görünmez.
 * - Her okuma tek bir yerel güne sınırlanır: gece yarısını geçen yürüyüş iki güne doğru bölünür.
 * - Recording API en fazla 10 gün geriye veri tutar; daha eskisi zaten Room'da olmalıdır.
 * - Bitişinden bu yana [FINALIZE_DELAY_MILLIS] geçmiş parçalar "tamamlandı" sayılır ve tekrar okunmaz.
 *   Bu hem gereksiz okumayı önler hem de saat dilimi değişince eski günlerin sınırlarının kaymasını engeller.
 */
object SyncPlanner {
  const val RETENTION_MILLIS = 10L * 24 * 60 * 60 * 1000
  /** Saklama sınırının hemen kenarını okumamak için güvenlik payı. */
  const val RETENTION_MARGIN_MILLIS = 60L * 60 * 1000
  const val FINALIZE_DELAY_MILLIS = 3L * 60 * 60 * 1000

  fun plan(
    sessions: List<SessionWindow>,
    nowMillis: Long,
    zone: ZoneId,
    isFinalized: (sessionId: Long, dayKey: String) -> Boolean,
  ): List<ReadWindow> {
    val oldestReadable = nowMillis - RETENTION_MILLIS + RETENTION_MARGIN_MILLIS
    val result = mutableListOf<ReadWindow>()
    for (s in sessions) {
      val from = max(s.startMillis, oldestReadable)
      val to = min(s.endMillis ?: nowMillis, nowMillis)
      if (to <= from) continue
      for (key in DayKeys.range(DayKeys.keyOf(from, zone), DayKeys.keyOf(to - 1, zone))) {
        if (isFinalized(s.id, key)) continue
        val start = max(DayKeys.startOfDayMillis(key, zone), from)
        val end = min(DayKeys.endOfDayMillis(key, zone), to)
        if (end <= start) continue
        result.add(ReadWindow(s.id, key, start, end, nowMillis - end >= FINALIZE_DELAY_MILLIS))
      }
    }
    return result
  }

  /** Aynı parça tekrar okunduğunda değer eklenmez, büyüğü tutulur. */
  fun mergeSegment(previous: Int?, fresh: Int): Int = max(previous ?: 0, fresh)
}
