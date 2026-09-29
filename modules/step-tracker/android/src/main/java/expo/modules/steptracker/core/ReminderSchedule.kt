package expo.modules.steptracker.core

import java.time.DayOfWeek
import java.time.ZonedDateTime

/**
 * Haftada iki tartılma günü: kullanıcının seçtiği gün ve ondan 3 gün sonrası
 * (ör. Pazartesi → Perşembe, Cuma → Pazartesi). Böylece ölçümler haftaya yaklaşık eşit dağılır.
 */
object ReminderSchedule {
  /** @param firstDay 1 = Pazartesi ... 7 = Pazar */
  fun days(firstDay: Int): Set<DayOfWeek> {
    val first = DayOfWeek.of(firstDay.coerceIn(1, 7))
    return setOf(first, first.plus(3))
  }

  /** `now` anından sonraki ilk hatırlatma anı (yerel saat diliminde, `hour`:00). */
  fun next(now: ZonedDateTime, firstDay: Int, hour: Int): ZonedDateTime {
    val targets = days(firstDay)
    var candidate = now.withHour(hour.coerceIn(0, 23)).withMinute(0).withSecond(0).withNano(0)
    repeat(8) {
      if (candidate.dayOfWeek in targets && candidate.isAfter(now)) return candidate
      candidate = candidate.plusDays(1).withHour(hour.coerceIn(0, 23))
    }
    return candidate
  }
}
