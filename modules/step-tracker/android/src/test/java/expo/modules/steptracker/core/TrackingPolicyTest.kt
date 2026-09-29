package expo.modules.steptracker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackingPolicyTest {
  private val counting = TrackingPrefs(trackingEnabled = true, notificationEnabled = true, lockScreenEnabled = true, hiddenByAction = false)
  private val allCaps = Capabilities(activityPermission = true, notificationPermission = true, hasLiveSensor = true, recordingAvailable = true)

  @Test
  fun `hide closes only the live notification, recording continues`() {
    val t = TrackingPolicy.reduce(counting, TrackingAction.HIDE)
    assertTrue(t.prefs.trackingEnabled)
    assertFalse(t.prefs.notificationEnabled)
    assertTrue(t.prefs.hiddenByAction)
    assertFalse(Effect.UNSUBSCRIBE_RECORDING in t.effects)
    assertFalse(Effect.CLOSE_SESSION in t.effects)

    val rt = TrackingPolicy.desiredRuntime(t.prefs, allCaps, uiVisible = false)
    assertFalse(rt.liveService)
    assertTrue(rt.recordingSubscribed)
    assertEquals(TrackerStatus.COUNTING, TrackingPolicy.status(t.prefs, allCaps))
  }

  @Test
  fun `stop ends recording after saving data first`() {
    val t = TrackingPolicy.reduce(counting, TrackingAction.STOP)
    assertFalse(t.prefs.trackingEnabled)
    val flush = t.effects.indexOf(Effect.FLUSH_RECORDING)
    val unsubscribe = t.effects.indexOf(Effect.UNSUBSCRIBE_RECORDING)
    assertTrue(flush >= 0 && unsubscribe > flush)
    assertTrue(Effect.CLOSE_SESSION in t.effects)

    val rt = TrackingPolicy.desiredRuntime(t.prefs, allCaps, uiVisible = true)
    assertFalse(rt.liveService)
    assertFalse(rt.recordingSubscribed)
    assertFalse(rt.uiSensor)
    assertEquals(TrackerStatus.STOPPED, TrackingPolicy.status(t.prefs, allCaps))
  }

  @Test
  fun `stop keeps the notification preference so start brings it back`() {
    val stopped = TrackingPolicy.reduce(counting, TrackingAction.STOP).prefs
    val started = TrackingPolicy.reduce(stopped, TrackingAction.START)
    assertTrue(Effect.OPEN_SESSION in started.effects)
    assertTrue(Effect.REBASE_LIVE in started.effects)
    assertTrue(TrackingPolicy.desiredRuntime(started.prefs, allCaps, false).liveService)
  }

  @Test
  fun `showing the notification again clears the hidden flag`() {
    val hidden = TrackingPolicy.reduce(counting, TrackingAction.HIDE).prefs
    val shown = TrackingPolicy.reduce(hidden, TrackingAction.SHOW_NOTIFICATION)
    assertTrue(shown.prefs.notificationEnabled)
    assertFalse(shown.prefs.hiddenByAction)
    assertTrue(Effect.SYNC_NOW in shown.effects)
  }

  @Test
  fun `lock screen needs the notification`() {
    val noNotification = counting.copy(notificationEnabled = false, lockScreenEnabled = true)
    assertFalse(TrackingPolicy.desiredRuntime(noNotification, allCaps, false).lockScreenVisible)
    val deniedPermission = allCaps.copy(notificationPermission = false)
    assertFalse(TrackingPolicy.desiredRuntime(counting, deniedPermission, false).lockScreenVisible)
    assertTrue(TrackingPolicy.desiredRuntime(counting, allCaps, false).lockScreenVisible)
  }

  @Test
  fun `live sensor listens only while visible or while the live service runs`() {
    val hidden = counting.copy(notificationEnabled = false)
    val rt = TrackingPolicy.desiredRuntime(hidden, allCaps, uiVisible = false)
    assertFalse(rt.uiSensor)
    assertFalse(rt.liveService)
    assertTrue(TrackingPolicy.desiredRuntime(hidden, allCaps, uiVisible = true).uiSensor)
  }

  @Test
  fun `missing permission or sensor gives a clear status`() {
    assertEquals(
      TrackerStatus.PERMISSION_REQUIRED,
      TrackingPolicy.status(counting, allCaps.copy(activityPermission = false)),
    )
    assertEquals(
      TrackerStatus.UNSUPPORTED,
      TrackingPolicy.status(counting, allCaps.copy(hasLiveSensor = false, recordingAvailable = false)),
    )
    assertFalse(TrackingPolicy.desiredRuntime(counting, allCaps.copy(activityPermission = false), true).recordingSubscribed)
  }

  @Test
  fun `start and stop are idempotent`() {
    assertTrue(TrackingPolicy.reduce(counting, TrackingAction.START).effects.isEmpty())
    val stopped = counting.copy(trackingEnabled = false)
    assertTrue(TrackingPolicy.reduce(stopped, TrackingAction.STOP).effects.isEmpty())
  }
}
