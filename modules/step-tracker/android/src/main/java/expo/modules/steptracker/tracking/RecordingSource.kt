package expo.modules.steptracker.tracking

import android.annotation.SuppressLint
import android.content.Context
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.fitness.FitnessLocal
import com.google.android.gms.fitness.LocalRecordingClient
import com.google.android.gms.fitness.data.LocalDataType
import com.google.android.gms.fitness.data.LocalField
import com.google.android.gms.fitness.request.LocalDataReadRequest
import kotlinx.coroutines.tasks.await
import java.util.concurrent.TimeUnit

enum class RecordingAvailability { AVAILABLE, UPDATE_REQUIRED, UNAVAILABLE }

/**
 * Recording API on mobile sarmalayıcısı (play-services-fitness içindeki FitnessLocal).
 *
 * Bu API, eski Google Fit Recording API'si değildir: hesap gerektirmez, veriyi cihazda tutar ve
 * donanım adım sayacını düşük güçle Google Play hizmetleri üzerinden kaydeder. Uygulamamız çalışmıyorken
 * de kayıt sürer. Veri en fazla 10 gün ve yalnızca abonelik sürerken okunabilir.
 */
class RecordingSource(private val context: Context) {
  private val client: LocalRecordingClient by lazy { FitnessLocal.getLocalRecordingClient(context) }

  fun availability(): RecordingAvailability =
    when (GoogleApiAvailability.getInstance()
      .isGooglePlayServicesAvailable(context, LocalRecordingClient.LOCAL_RECORDING_CLIENT_MIN_VERSION_CODE)) {
      ConnectionResult.SUCCESS -> RecordingAvailability.AVAILABLE
      ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED -> RecordingAvailability.UPDATE_REQUIRED
      else -> RecordingAvailability.UNAVAILABLE
    }

  @SuppressLint("MissingPermission") // Çağıran taraf ACTIVITY_RECOGNITION iznini kontrol eder.
  suspend fun subscribe() {
    client.subscribe(LocalDataType.TYPE_STEP_COUNT_DELTA).await()
  }

  suspend fun unsubscribe() {
    client.unsubscribe(LocalDataType.TYPE_STEP_COUNT_DELTA).await()
  }

  /** [startMillis, endMillis) aralığındaki toplam adım. API saniye çözünürlüğünde çalışır. */
  @SuppressLint("MissingPermission")
  suspend fun readSteps(startMillis: Long, endMillis: Long): Int {
    val startSec = startMillis / 1000
    val endSec = endMillis / 1000
    if (endSec <= startSec) return 0
    val request = LocalDataReadRequest.Builder()
      .aggregate(LocalDataType.TYPE_STEP_COUNT_DELTA)
      // Aralık zaten tek bir yerel güne sınırlı. 25 saatlik yaz saati günü iki kovaya bölünebilir;
      // tüm kovaları topladığımız için sonuç doğru kalır.
      .bucketByTime(1, TimeUnit.DAYS)
      .setTimeRange(startSec, endSec, TimeUnit.SECONDS)
      .build()
    val response = client.readData(request).await()
    var total = 0
    for (bucket in response.buckets) {
      for (dataSet in bucket.dataSets) {
        for (point in dataSet.dataPoints) {
          total += point.getValue(LocalField.FIELD_STEPS).asInt()
        }
      }
    }
    return total
  }
}
