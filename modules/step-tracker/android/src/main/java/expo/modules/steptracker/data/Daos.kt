package expo.modules.steptracker.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import expo.modules.steptracker.core.SyncPlanner

@Dao
abstract class StepDao {
  @Query("SELECT steps FROM daily_steps WHERE date = :date")
  abstract suspend fun getSteps(date: String): Int?

  @Query("SELECT * FROM daily_steps WHERE date BETWEEN :from AND :to ORDER BY date")
  abstract suspend fun range(from: String, to: String): List<DailyStepsEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  protected abstract suspend fun putDay(entity: DailyStepsEntity)

  /** Günlük toplamı yalnızca artırır. Aynı veri tekrar yazılırsa hiçbir şey değişmez. */
  @Transaction
  open suspend fun raiseTo(date: String, steps: Int, now: Long) {
    val current = getSteps(date)
    if (current == null || steps > current) putDay(DailyStepsEntity(date, steps, now))
  }

  /** Tek seferlik düzeltme: Recording verisi olan günleri Recording toplamına eşitler (bkz. StepEngine). */
  @Query(
    "UPDATE daily_steps SET steps = (SELECT SUM(r.steps) FROM recording_segments r WHERE r.date = daily_steps.date), " +
      "updatedAt = :now WHERE date IN (SELECT date FROM recording_segments)"
  )
  abstract suspend fun resetDaysToRecorded(now: Long)

  @Query("SELECT * FROM recording_segments WHERE sessionId = :sessionId AND date = :date")
  protected abstract suspend fun getSegment(sessionId: Long, date: String): RecordingSegmentEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  protected abstract suspend fun putSegment(entity: RecordingSegmentEntity)

  @Transaction
  open suspend fun mergeSegment(sessionId: Long, date: String, steps: Int, finalized: Boolean, now: Long) {
    val old = getSegment(sessionId, date)
    putSegment(
      RecordingSegmentEntity(
        sessionId = sessionId,
        date = date,
        steps = SyncPlanner.mergeSegment(old?.steps, steps),
        finalized = (old?.finalized ?: false) || finalized,
        readAt = now,
      )
    )
  }

  @Query("SELECT COUNT(*) > 0 FROM recording_segments WHERE sessionId = :sessionId AND date = :date AND finalized = 1")
  abstract suspend fun isFinalized(sessionId: Long, date: String): Boolean

  @Query("SELECT COALESCE(SUM(steps), 0) FROM recording_segments WHERE date = :date")
  abstract suspend fun recordedTotal(date: String): Int

  @Insert
  abstract suspend fun insertSession(session: TrackingSessionEntity): Long

  @Query("UPDATE tracking_sessions SET endMillis = :end WHERE id = :id")
  abstract suspend fun closeSession(id: Long, end: Long)

  @Query("UPDATE tracking_sessions SET endMillis = :end WHERE endMillis IS NULL")
  abstract suspend fun closeAllOpenSessions(end: Long)

  @Query("SELECT * FROM tracking_sessions WHERE endMillis IS NULL OR endMillis > :after ORDER BY startMillis")
  abstract suspend fun sessionsEndingAfter(after: Long): List<TrackingSessionEntity>

  @Query("SELECT * FROM tracking_sessions WHERE endMillis IS NULL ORDER BY startMillis DESC LIMIT 1")
  abstract suspend fun openSession(): TrackingSessionEntity?

  @Query("DELETE FROM daily_steps")
  abstract suspend fun clearDays()

  @Query("DELETE FROM recording_segments")
  abstract suspend fun clearSegments()

  @Query("DELETE FROM tracking_sessions WHERE endMillis IS NOT NULL")
  abstract suspend fun clearClosedSessions()

  @Query("UPDATE tracking_sessions SET startMillis = :start WHERE endMillis IS NULL")
  abstract suspend fun restartOpenSessions(start: Long)
}

@Dao
interface HealthDao {
  @Query("SELECT * FROM profile WHERE id = 1")
  suspend fun profile(): ProfileEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun saveProfile(profile: ProfileEntity)

  @Query("SELECT * FROM weight_entries ORDER BY date DESC, createdAt DESC")
  suspend fun weights(): List<WeightEntryEntity>

  @Insert
  suspend fun addWeight(entry: WeightEntryEntity): Long

  @Query("DELETE FROM weight_entries WHERE id = :id")
  suspend fun deleteWeight(id: Long)

  @Query("SELECT * FROM calorie_intake WHERE date BETWEEN :from AND :to ORDER BY date")
  suspend fun intake(from: String, to: String): List<CalorieIntakeEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun putIntake(entity: CalorieIntakeEntity)

  @Query("DELETE FROM calorie_intake WHERE date = :date")
  suspend fun deleteIntake(date: String)

  @Query("DELETE FROM weight_entries")
  suspend fun clearWeights()

  @Query("DELETE FROM calorie_intake")
  suspend fun clearIntake()

  @Query("DELETE FROM profile")
  suspend fun clearProfile()
}
