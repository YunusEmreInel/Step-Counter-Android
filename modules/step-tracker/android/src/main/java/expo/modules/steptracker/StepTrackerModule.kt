package expo.modules.steptracker

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.steptracker.data.CalorieIntakeEntity
import expo.modules.steptracker.data.ProfileEntity
import expo.modules.steptracker.data.WeightEntryEntity
import expo.modules.steptracker.tracking.StepEngine
import expo.modules.steptracker.tracking.StepNotificationService
import expo.modules.steptracker.tracking.WeighReminder
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch

class ProfileRecord : Record {
  @Field var heightCm: Double? = null
  @Field var birthYear: Int? = null
  @Field var sex: String? = null
  @Field var activityFactor: Double? = null
  @Field var manualMaintenanceKcal: Int? = null
  @Field var strideCm: Double? = null
  @Field var dailyGoal: Int = DEFAULT_GOAL
  @Field var goalWeightKg: Double? = null
  @Field var goalStartDate: String? = null
  @Field var goalStartWeightKg: Double? = null
}

private const val DEFAULT_GOAL = 8000

/**
 * React Native köprüsü. Burada iş mantığı yoktur: çağrıları StepEngine'e ve Room DAO'larına iletir,
 * durum değişikliklerini "onStateChange" olayıyla TypeScript tarafına gönderir.
 */
class StepTrackerModule : Module() {
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val engine get() = StepEngine.get(context)
  private var stateJob: Job? = null

  override fun definition() = ModuleDefinition {
    Name("StepTracker")

    Events("onStateChange")

    OnCreate {
      StepNotificationService.ensureChannel(context)
    }

    OnStartObserving("onStateChange") {
      stateJob?.cancel()
      stateJob = engine.scope.launch {
        engine.state.filterNotNull().collect { sendEvent("onStateChange", it.toMap()) }
      }
    }

    OnStopObserving("onStateChange") {
      stateJob?.cancel()
      stateJob = null
    }

    OnActivityEntersBackground {
      engine.scope.launch { engine.setUiVisible(false) }
    }

    OnDestroy {
      stateJob?.cancel()
      engine.scope.launch { engine.setUiVisible(false) }
    }

    AsyncFunction("getState") Coroutine { ->
      engine.snapshot().toMap()
    }

    AsyncFunction("setAppActive") Coroutine { active: Boolean ->
      engine.setUiVisible(active)
      engine.snapshot().toMap()
    }

    AsyncFunction("start") Coroutine { -> engine.start().toMap() }
    AsyncFunction("stop") Coroutine { -> engine.stop().toMap() }
    AsyncFunction("hideNotification") Coroutine { -> engine.hide().toMap() }
    AsyncFunction("setNotificationEnabled") Coroutine { enabled: Boolean ->
      engine.setNotificationEnabled(enabled).toMap()
    }
    AsyncFunction("setLockScreenEnabled") Coroutine { enabled: Boolean ->
      engine.setLockScreenEnabled(enabled).toMap()
    }
    AsyncFunction("completeOnboarding") Coroutine { ->
      engine.completeOnboarding()
      engine.snapshot().toMap()
    }
    AsyncFunction("syncNow") Coroutine { ->
      engine.sync()
      engine.snapshot().toMap()
    }

    AsyncFunction("getDays") Coroutine { from: String, to: String ->
      engine.days(from, to).map { mapOf("date" to it.date, "steps" to it.steps) }
    }

    AsyncFunction("deleteStepHistory") Coroutine { ->
      engine.deleteStepHistory()
      engine.snapshot().toMap()
    }

    AsyncFunction("deleteAllData") Coroutine { ->
      engine.deleteAllData()
      engine.snapshot().toMap()
    }

    // --- Profil, kilo, kalori ------------------------------------------------------------------

    AsyncFunction("getProfile") Coroutine { ->
      val p = engine.healthDao.profile()
      mapOf(
        "heightCm" to p?.heightCm,
        "birthYear" to p?.birthYear,
        "sex" to p?.sex,
        "activityFactor" to p?.activityFactor,
        "manualMaintenanceKcal" to p?.manualMaintenanceKcal,
        "strideCm" to p?.strideCm,
        "dailyGoal" to (p?.dailyGoal ?: DEFAULT_GOAL),
        "goalWeightKg" to p?.goalWeightKg,
        "goalStartDate" to p?.goalStartDate,
        "goalStartWeightKg" to p?.goalStartWeightKg,
      )
    }

    AsyncFunction("saveProfile") Coroutine { p: ProfileRecord ->
      engine.healthDao.saveProfile(
        ProfileEntity(
          heightCm = p.heightCm,
          birthYear = p.birthYear,
          sex = p.sex?.takeIf { it == "female" || it == "male" },
          activityFactor = p.activityFactor,
          manualMaintenanceKcal = p.manualMaintenanceKcal,
          strideCm = p.strideCm,
          dailyGoal = p.dailyGoal.coerceIn(100, 100_000),
          goalWeightKg = p.goalWeightKg,
          goalStartDate = p.goalStartDate,
          goalStartWeightKg = p.goalStartWeightKg,
        )
      )
    }

    // --- Tartılma hatırlatıcısı ------------------------------------------------------------------

    Function("getWeighReminder") {
      val s = engine.settings
      mapOf("enabled" to s.weighReminderEnabled, "firstDay" to s.weighReminderFirstDay, "hour" to s.weighReminderHour)
    }

    Function("setWeighReminder") { enabled: Boolean, firstDay: Int, hour: Int ->
      val s = engine.settings
      s.weighReminderEnabled = enabled
      s.weighReminderFirstDay = firstDay.coerceIn(1, 7)
      s.weighReminderHour = hour.coerceIn(5, 11)
      WeighReminder.schedule(context)
    }

    AsyncFunction("getWeights") Coroutine { ->
      engine.healthDao.weights().map {
        mapOf("id" to it.id.toDouble(), "date" to it.date, "weightKg" to it.weightKg)
      }
    }

    AsyncFunction("addWeight") Coroutine { date: String, weightKg: Double ->
      engine.healthDao.addWeight(WeightEntryEntity(date = date, weightKg = weightKg, createdAt = System.currentTimeMillis()))
    }

    AsyncFunction("deleteWeight") Coroutine { id: Double ->
      engine.healthDao.deleteWeight(id.toLong())
    }

    AsyncFunction("getIntake") Coroutine { from: String, to: String ->
      engine.healthDao.intake(from, to).map { mapOf("date" to it.date, "kcal" to it.kcal) }
    }

    AsyncFunction("setIntake") Coroutine { date: String, kcal: Int? ->
      if (kcal == null) engine.healthDao.deleteIntake(date)
      else engine.healthDao.putIntake(CalorieIntakeEntity(date, kcal, System.currentTimeMillis()))
    }

    // --- Android ayarlarına yönlendirme -----------------------------------------------------------

    Function("openAppSettings") {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("openNotificationSettings") {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
