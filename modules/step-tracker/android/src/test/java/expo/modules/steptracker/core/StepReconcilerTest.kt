package expo.modules.steptracker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class StepReconcilerTest {
  private val istanbul = ZoneId.of("Europe/Istanbul")
  private fun at(h: Int, m: Int = 0, day: Int = 10) =
    ZonedDateTime.of(2026, 3, day, h, m, 0, 0, istanbul).toInstant().toEpochMilli()

  private fun reconciler() = StepReconciler { istanbul }

  @Test
  fun `live steps increase the count one by one`() {
    val r = reconciler()
    r.startDay("2026-03-10", 0, 0, at(0))
    repeat(3) { i ->
      assertEquals(StepReconciler.LiveResult.Counted, r.onLiveSteps(1, at(9, i)))
      assertEquals(i + 1, r.displayed)
    }
  }

  @Test
  fun `the same steps from both sources are not counted twice`() {
    val r = reconciler()
    r.startDay("2026-03-10", 0, 0, at(0))
    repeat(100) { r.onLiveSteps(1, at(9)) }
    // Recording API aynı 100 adımı daha sonra bildiriyor.
    r.onRecordedTotal(100, at(9, 5))
    assertEquals(100, r.displayed)
  }

  @Test
  fun `a late smaller recording value never lowers the displayed count`() {
    val r = reconciler()
    r.startDay("2026-03-10", 500, 0, at(8))
    repeat(20) { r.onLiveSteps(1, at(9)) }
    assertFalse(r.onRecordedTotal(300, at(9, 1)))
    assertEquals(520, r.displayed)
  }

  @Test
  fun `recording catches missed steps and live counting continues on top`() {
    val r = reconciler()
    r.startDay("2026-03-10", 1000, 1000, at(8))
    repeat(50) { r.onLiveSteps(1, at(9)) } // canlı: 1050
    assertTrue(r.onRecordedTotal(1200, at(9, 10))) // sensörün kaçırdığı adımlar
    assertEquals(1200, r.displayed)
    r.onLiveSteps(1, at(9, 11))
    assertEquals(1201, r.displayed)
  }

  @Test
  fun `steps before the baseline are rejected`() {
    val r = reconciler()
    r.startDay("2026-03-10", 800, 0, at(12))
    assertEquals(StepReconciler.LiveResult.AlreadyCovered, r.onLiveSteps(1, at(11, 59)))
    assertEquals(800, r.displayed)
  }

  @Test
  fun `rebase on start ignores steps taken while stopped`() {
    val r = reconciler()
    r.startDay("2026-03-10", 0, 0, at(0))
    repeat(10) { r.onLiveSteps(1, at(9)) }
    r.rebase(at(14)) // Başlat 14:00'te
    // Biriktirilmiş olay: 13:59'da, yani durdurulmuşken atılmış adım
    assertEquals(StepReconciler.LiveResult.AlreadyCovered, r.onLiveSteps(1, at(13, 59)))
    r.onLiveSteps(1, at(14, 1))
    assertEquals(11, r.displayed)
  }

  @Test
  fun `a step after midnight asks for a day rollover`() {
    val r = reconciler()
    r.startDay("2026-03-10", 7000, 0, at(23))
    val result = r.onLiveSteps(1, at(0, 1, day = 11))
    assertEquals(StepReconciler.LiveResult.NeedsRollover("2026-03-11"), result)
    assertEquals(7000, r.displayed)
  }

  @Test
  fun `a batched step from before midnight is not added to the new day`() {
    val r = reconciler()
    r.startDay("2026-03-11", 0, 0, at(0, day = 11))
    assertEquals(StepReconciler.LiveResult.PreviousDay, r.onLiveSteps(1, at(23, 59, day = 10)))
    assertEquals(0, r.displayed)
  }

  @Test
  fun `restart loads stored total without double counting`() {
    val r = reconciler()
    r.startDay("2026-03-10", 0, 0, at(0))
    repeat(40) { r.onLiveSteps(1, at(9)) }
    val persisted = r.displayed
    // Süreç kapandı ve yeniden açıldı: kayıtlı toplam taban olur, yeni adımlar üstüne eklenir.
    val restarted = reconciler()
    restarted.startDay("2026-03-10", persisted, 0, at(10))
    restarted.onLiveSteps(1, at(10, 1))
    assertEquals(41, restarted.displayed)
  }
}
