package expo.modules.steptracker.tracking

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock

/**
 * SensorManager üzerinden canlı adım olayları.
 *
 * Birincil kaynak TYPE_STEP_COUNTER'dır. Android dokümantasyonuna göre step counter, step detector'dan daha
 * gecikmeli (en fazla ~10 sn) ama daha doğrudur: aradaki sürede yanlış pozitifleri (el sallama, sarsıntı) ayıklar.
 * Recording API de aynı donanım sayacını kullandığı için iki kaynak aynı ölçeği paylaşır ve uzlaştırmada
 * birbirini yukarı çekmez. Sayacın kendisi (açılıştan beri toplam) sıfırlanmaz; yalnızca iki olay arasındaki
 * artış okunur.
 *
 * TYPE_STEP_DETECTOR yalnızca sayacı olmayan cihazlarda yedek olarak kullanılır.
 *
 * Birden çok "istemci" aynı dinleyiciyi paylaşır: "ui" (uygulama ekranda) ve "service" (canlı bildirim).
 * Hiç istemci yoksa sensör kaydı tamamen kaldırılır.
 */
class LiveStepSensor(
  context: Context,
  private val onSteps: (count: Int, stepTimeMillis: Long) -> Unit,
) : SensorEventListener {
  private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  val counter: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
  val detector: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
  private val source: Sensor? = counter ?: detector
  val hasSensor: Boolean get() = source != null
  val usesCounter: Boolean get() = counter != null

  private val clients = mutableMapOf<String, Int>()
  private var registeredLatencyUs: Int? = null
  private var thread: HandlerThread? = null
  private var lastCounterValue: Float? = null

  /**
   * @param maxLatencyUs null: istemciyi kaldır. 0: olaylar hemen gelsin. >0: donanım olayları biriktirip toplu
   * gönderebilir; ekran kapalıyken işlemcinin daha az uyanmasını sağlar.
   */
  @Synchronized
  fun setClient(name: String, maxLatencyUs: Int?) {
    if (maxLatencyUs == null) clients.remove(name) else clients[name] = maxLatencyUs
    reconfigure()
  }

  @Synchronized
  private fun reconfigure() {
    val desired = clients.values.minOrNull()
    if (desired == registeredLatencyUs) return
    if (registeredLatencyUs != null) {
      sensorManager.unregisterListener(this)
      registeredLatencyUs = null
    }
    val sensor = source
    if (desired == null || sensor == null) {
      thread?.quitSafely()
      thread = null
      return
    }
    val t = thread ?: HandlerThread("step-sensor").also { it.start(); thread = it }
    // Yeni kayıttan sonraki ilk sayaç değeri yalnızca referanstır; kayıtlar arasındaki adımları Recording API kapatır.
    lastCounterValue = null
    val ok = sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL, desired, Handler(t.looper))
    registeredLatencyUs = if (ok) desired else null
  }

  override fun onSensorChanged(event: SensorEvent) {
    val time = wallTimeOf(event)
    when (event.sensor.type) {
      Sensor.TYPE_STEP_COUNTER -> {
        val value = event.values[0]
        val previous = lastCounterValue
        lastCounterValue = value
        if (previous == null) return
        val delta = (value - previous).toInt()
        // Negatif fark: cihaz yeniden başlamış, sayaç sıfırdan başlamış olabilir. Tahmin yürütmeyiz.
        if (delta in 1..MAX_COUNTER_DELTA) onSteps(delta, time)
      }
      Sensor.TYPE_STEP_DETECTOR -> onSteps(1, time)
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  /**
   * Olayın gerçek zamanı. event.timestamp çoğu cihazda elapsedRealtimeNanos tabanlıdır; biriktirilmiş olaylar
   * geç gelse bile adımın atıldığı anı bulmamızı sağlar. Değer tutarsızsa alınma anı kullanılır.
   */
  private fun wallTimeOf(event: SensorEvent): Long {
    val now = System.currentTimeMillis()
    val ageMs = (SystemClock.elapsedRealtimeNanos() - event.timestamp) / 1_000_000
    return if (ageMs in 0..MAX_EVENT_AGE_MS) now - ageMs else now
  }

  companion object {
    private const val MAX_COUNTER_DELTA = 10_000
    private const val MAX_EVENT_AGE_MS = 10 * 60 * 1000L
  }
}
