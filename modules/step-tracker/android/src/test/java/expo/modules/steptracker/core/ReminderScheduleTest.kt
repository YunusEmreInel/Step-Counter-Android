package expo.modules.steptracker.core

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.DayOfWeek
import java.time.ZoneId
import java.time.ZonedDateTime

class ReminderScheduleTest {
  private val zone = ZoneId.of("Europe/Istanbul")
  private fun at(day: Int, hour: Int, minute: Int = 0) = ZonedDateTime.of(2026, 9, day, hour, minute, 0, 0, zone)

  @Test
  fun `two days three days apart`() {
    assertEquals(setOf(DayOfWeek.MONDAY, DayOfWeek.THURSDAY), ReminderSchedule.days(1))
    assertEquals(setOf(DayOfWeek.FRIDAY, DayOfWeek.MONDAY), ReminderSchedule.days(5))
    assertEquals(setOf(DayOfWeek.SUNDAY, DayOfWeek.WEDNESDAY), ReminderSchedule.days(7))
  }

  @Test
  fun `next reminder is the same morning when still before the hour`() {
    // 28 Eylül 2026 Pazartesi 06:30 → aynı gün 08:00
    assertEquals(at(28, 8), ReminderSchedule.next(at(28, 6, 30), firstDay = 1, hour = 8))
  }

  @Test
  fun `after the reminder time it jumps to the second day`() {
    // Pazartesi 09:00 → Perşembe 1 Ekim 08:00
    val next = ReminderSchedule.next(at(28, 9), firstDay = 1, hour = 8)
    assertEquals(DayOfWeek.THURSDAY, next.dayOfWeek)
    assertEquals(8, next.hour)
    assertEquals(1, next.dayOfMonth)
  }

  @Test
  fun `after the second day it wraps to next week`() {
    // Perşembe 1 Ekim 10:00 → Pazartesi 5 Ekim 08:00
    val thursday = ZonedDateTime.of(2026, 10, 1, 10, 0, 0, 0, zone)
    val next = ReminderSchedule.next(thursday, firstDay = 1, hour = 8)
    assertEquals(DayOfWeek.MONDAY, next.dayOfWeek)
    assertEquals(5, next.dayOfMonth)
  }
}
