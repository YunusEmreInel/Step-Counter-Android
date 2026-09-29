package expo.modules.steptracker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class SyncPlannerTest {
  private val istanbul = ZoneId.of("Europe/Istanbul")
  private val berlin = ZoneId.of("Europe/Berlin")

  private fun ms(zone: ZoneId, y: Int, mo: Int, d: Int, h: Int, mi: Int = 0) =
    ZonedDateTime.of(y, mo, d, h, mi, 0, 0, zone).toInstant().toEpochMilli()

  @Test
  fun `a walk across midnight is split into two local days`() {
    val start = ms(istanbul, 2026, 5, 1, 23, 30)
    val now = ms(istanbul, 2026, 5, 2, 0, 30)
    val windows = SyncPlanner.plan(listOf(SessionWindow(1, start, null)), now, istanbul) { _, _ -> false }
    assertEquals(listOf("2026-05-01", "2026-05-02"), windows.map { it.dayKey })
    assertEquals(ms(istanbul, 2026, 5, 2, 0), windows[0].endMillis)
    assertEquals(ms(istanbul, 2026, 5, 2, 0), windows[1].startMillis)
    assertEquals(now, windows[1].endMillis)
  }

  @Test
  fun `stopped periods are never read`() {
    val first = SessionWindow(1, ms(istanbul, 2026, 5, 1, 8), ms(istanbul, 2026, 5, 1, 10))
    val second = SessionWindow(2, ms(istanbul, 2026, 5, 1, 14), null)
    val now = ms(istanbul, 2026, 5, 1, 15)
    val windows = SyncPlanner.plan(listOf(first, second), now, istanbul) { _, _ -> false }
    assertEquals(2, windows.size)
    assertEquals(ms(istanbul, 2026, 5, 1, 10), windows[0].endMillis)
    assertEquals(ms(istanbul, 2026, 5, 1, 14), windows[1].startMillis)
  }

  @Test
  fun `data older than the 10 day retention is not requested`() {
    val now = ms(istanbul, 2026, 5, 20, 12)
    val start = ms(istanbul, 2026, 4, 1, 8)
    val windows = SyncPlanner.plan(listOf(SessionWindow(1, start, null)), now, istanbul) { _, _ -> false }
    assertTrue(windows.all { it.startMillis >= now - SyncPlanner.RETENTION_MILLIS })
    assertTrue(windows.size <= 11)
  }

  @Test
  fun `finalized days are skipped and old days become finalized`() {
    val start = ms(istanbul, 2026, 5, 1, 8)
    val now = ms(istanbul, 2026, 5, 3, 1)
    val windows = SyncPlanner.plan(listOf(SessionWindow(7, start, null)), now, istanbul) { _, day -> day == "2026-05-01" }
    assertEquals(listOf("2026-05-02", "2026-05-03"), windows.map { it.dayKey })
    // 2 Mayıs 00:00'da bitti, şimdi 3 Mayıs 01:00 → 1 saat geçti, henüz kesinleşmedi.
    assertFalse(windows[0].finalizeAfterRead)
    val later = SyncPlanner.plan(listOf(SessionWindow(7, start, null)), ms(istanbul, 2026, 5, 3, 4), istanbul) { _, day -> day == "2026-05-01" }
    assertTrue(later[0].finalizeAfterRead)
  }

  @Test
  fun `daylight saving days have 23 and 25 hours`() {
    // Berlin: 29 Mart 2026 ileri (23 saat), 25 Ekim 2026 geri (25 saat).
    val spring = DayKeys.endOfDayMillis("2026-03-29", berlin) - DayKeys.startOfDayMillis("2026-03-29", berlin)
    val autumn = DayKeys.endOfDayMillis("2026-10-25", berlin) - DayKeys.startOfDayMillis("2026-10-25", berlin)
    assertEquals(23L * 3600_000, spring)
    assertEquals(25L * 3600_000, autumn)
    // 25 saatlik günün tamamı tek bir güne ait okunur.
    val start = DayKeys.startOfDayMillis("2026-10-25", berlin)
    val end = DayKeys.endOfDayMillis("2026-10-25", berlin)
    val w = SyncPlanner.plan(listOf(SessionWindow(1, start, end)), end + 1, berlin) { _, _ -> false }
    assertEquals(listOf("2026-10-25"), w.map { it.dayKey })
    assertEquals(25L * 3600_000, w[0].endMillis - w[0].startMillis)
  }

  @Test
  fun `re-reading the same data does not add steps twice`() {
    // Room'daki segment birleştirme kuralının aynısı: eklenmez, büyüğü tutulur.
    var stored: Int? = null
    repeat(3) { stored = SyncPlanner.mergeSegment(stored, 4200) }
    assertEquals(4200, stored)
    assertEquals(4300, SyncPlanner.mergeSegment(stored, 4300))
    assertEquals(4200, SyncPlanner.mergeSegment(4200, 100)) // abonelik yenilendiyse gelen küçük değer
  }

  @Test
  fun `day key follows the phone time zone`() {
    val instant = ms(ZoneId.of("UTC"), 2026, 6, 1, 22, 30)
    assertEquals("2026-06-02", DayKeys.keyOf(instant, istanbul)) // UTC+3 → 01:30
    assertEquals("2026-06-01", DayKeys.keyOf(instant, ZoneId.of("America/New_York")))
    assertEquals(ms(istanbul, 2026, 6, 3, 0), DayKeys.nextMidnightMillis(instant, istanbul))
  }
}
