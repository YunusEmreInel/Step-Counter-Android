package expo.modules.steptracker.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Bir günün en iyi bilinen adım toplamı (alt sınır; yalnızca artabilir). */
@Entity(tableName = "daily_steps")
data class DailyStepsEntity(
  @PrimaryKey val date: String,
  val steps: Int,
  val updatedAt: Long,
)

/** Recording API'den bir oturumun bir güne düşen kısmı için okunan toplam. */
@Entity(tableName = "recording_segments", primaryKeys = ["sessionId", "date"])
data class RecordingSegmentEntity(
  val sessionId: Long,
  val date: String,
  val steps: Int,
  val finalized: Boolean,
  val readAt: Long,
)

/** Başlat ile Durdur arasındaki kayıt dönemi. endMillis null ise hâlâ sürüyor. */
@Entity(tableName = "tracking_sessions")
data class TrackingSessionEntity(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val startMillis: Long,
  val endMillis: Long?,
)

@Entity(tableName = "weight_entries", indices = [Index("date")])
data class WeightEntryEntity(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val date: String,
  val weightKg: Double,
  val createdAt: Long,
)

/** Kullanıcının elle girdiği günlük tüketilen kalori. */
@Entity(tableName = "calorie_intake")
data class CalorieIntakeEntity(
  @PrimaryKey val date: String,
  val kcal: Int,
  val updatedAt: Long,
)

/** Tek satırlık profil. Kullanıcının vermediği alanlar null kalır; uygulama bunlar için sayı uydurmaz. */
@Entity(tableName = "profile")
data class ProfileEntity(
  @PrimaryKey val id: Int = 1,
  val heightCm: Double?,
  val birthYear: Int?,
  /** Mifflin-St Jeor denkleminin gerektirdiği parametre: "female" | "male" | null */
  val sex: String?,
  /** Adımlar HARİÇ temel aktivite katsayısı */
  val activityFactor: Double?,
  /** Kullanıcının kendi bakım kalorisi tahmini (girildiyse formül yerine kullanılır) */
  val manualMaintenanceKcal: Int?,
  /** Elle kalibre edilmiş adım uzunluğu */
  val strideCm: Double?,
  val dailyGoal: Int,
  /** Kullanıcının belirlediği hedef kilo */
  val goalWeightKg: Double? = null,
  /** Hedefin belirlendiği gün ve o günkü (eğilim) kilo: ilerleme buradan ölçülür */
  val goalStartDate: String? = null,
  val goalStartWeightKg: Double? = null,
)
