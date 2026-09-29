package expo.modules.steptracker.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
  entities = [
    DailyStepsEntity::class,
    RecordingSegmentEntity::class,
    TrackingSessionEntity::class,
    WeightEntryEntity::class,
    CalorieIntakeEntity::class,
    ProfileEntity::class,
  ],
  version = 2,
  exportSchema = false,
)
abstract class StepDatabase : RoomDatabase() {
  abstract fun stepDao(): StepDao
  abstract fun healthDao(): HealthDao

  companion object {
    @Volatile private var instance: StepDatabase? = null

    /** 2. sürüm: kilo hedefi (hedef kilo, başlangıç tarihi ve başlangıç kilosu). Mevcut veriler korunur. */
    private val MIGRATION_1_2 = object : Migration(1, 2) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE profile ADD COLUMN goalWeightKg REAL")
        db.execSQL("ALTER TABLE profile ADD COLUMN goalStartDate TEXT")
        db.execSQL("ALTER TABLE profile ADD COLUMN goalStartWeightKg REAL")
      }
    }

    fun get(context: Context): StepDatabase =
      instance ?: synchronized(this) {
        instance ?: Room.databaseBuilder(context.applicationContext, StepDatabase::class.java, "adim_sayar.db")
          .addMigrations(MIGRATION_1_2)
          .build()
          .also { instance = it }
      }
  }
}
