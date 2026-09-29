package expo.modules.steptracker.tracking

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Recording API verisini düzenli aralıklarla Room'a aktarır.
 *
 * Recording API yalnızca son 10 günü tutar. Kullanıcı uygulamayı günlerce açmasa bile geçmişin
 * kaybolmaması için 3 saatte bir kısa bir okuma yeterlidir. İşlemciyi uyanık tutan sürekli bir
 * döngü veya saniyelik sorgu yoktur; zamanlamayı Android'in pil dostu iş planlayıcısı yapar.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    StepEngine.get(applicationContext).sync()
    return Result.success()
  }
}

object SyncScheduler {
  private const val UNIQUE_NAME = "step-recording-sync"
  private const val INTERVAL_HOURS = 3L

  fun schedule(context: Context) {
    val request = PeriodicWorkRequestBuilder<SyncWorker>(INTERVAL_HOURS, TimeUnit.HOURS).build()
    WorkManager.getInstance(context)
      .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
  }

  fun cancel(context: Context) {
    WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_NAME)
  }
}
