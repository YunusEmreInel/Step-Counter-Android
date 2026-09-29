package expo.modules.steptracker.core

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Adımların hangi güne yazılacağını belirleyen saf yardımcılar.
 *
 * Kural: bir adımın günü, adımın atıldığı andaki telefonun yerel saat dilimine göre belirlenir.
 * Gün anahtarı "YYYY-MM-DD" biçimindedir. Gün sınırları sabit 24 saat varsayılmadan
 * `ZonedDateTime` ile hesaplanır; böylece yaz saati geçişinde 23 veya 25 saatlik günler doğru ele alınır.
 */
object DayKeys {
  private val FORMAT: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

  fun keyOf(epochMillis: Long, zone: ZoneId): String =
    Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate().format(FORMAT)

  fun parse(key: String): LocalDate = LocalDate.parse(key, FORMAT)

  fun format(date: LocalDate): String = date.format(FORMAT)

  /** Günün yerel başlangıcı (dahil). Yaz saati geçişinde gece yarısı yoksa ilk geçerli an döner. */
  fun startOfDayMillis(key: String, zone: ZoneId): Long =
    parse(key).atStartOfDay(zone).toInstant().toEpochMilli()

  /** Günün yerel bitişi (hariç) = ertesi günün başlangıcı. */
  fun endOfDayMillis(key: String, zone: ZoneId): Long =
    parse(key).plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()

  /** `now` anından sonraki ilk yerel gece yarısı. */
  fun nextMidnightMillis(now: Long, zone: ZoneId): Long =
    endOfDayMillis(keyOf(now, zone), zone)

  fun addDays(key: String, days: Long): String = format(parse(key).plusDays(days))

  /** [from, to] aralığındaki tüm gün anahtarları (her ikisi dahil). */
  fun range(from: String, to: String): List<String> {
    val result = mutableListOf<String>()
    var d = parse(from)
    val end = parse(to)
    while (!d.isAfter(end)) {
      result.add(format(d))
      d = d.plusDays(1)
    }
    return result
  }
}
