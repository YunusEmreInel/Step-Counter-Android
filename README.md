# Step Counter for Android (Adım Sayar)

An ad-free, account-free, server-free step counter for Android with weight-goal tracking. All data stays on the phone.

> The app's user interface is in **Turkish**. UI labels quoted in this document are given in Turkish with an English
> translation, so you can match them to what you see on the screen.

- **UI:** React Native + Expo (SDK 57) + TypeScript, tab navigation with Expo Router
- **Android side:** a local Expo native module written in Kotlin (`modules/step-tracker`)
- **Storage:** Android Room (SQLite)
- **Background recording:** Google Play services **Recording API on mobile** (`play-services-fitness` → `FitnessLocal`)
- **Live counting:** `SensorManager` + `TYPE_STEP_COUNTER` deltas (falls back to `TYPE_STEP_DETECTOR` if there is no counter)
- **Live notification:** a foreground service of type `health`
- **Scheduled sync:** WorkManager (every 3 hours)
- **Weight goal:** target weight, smoothed weight trend, daily calorie limit, contribution of steps, weigh-in reminders

> The legacy **Google Fit** APIs are not used. The Google Fit APIs are being shut down at the end of 2026 and have not
> accepted new developers since May 1, 2024. Recording API on mobile is a separate API: it needs no Google account and
> keeps data on the device. Source: https://developer.android.com/health-and-fitness/guides/recording-api

> **Development note:** This project was built with the help of **Claude** (Claude Code), Anthropic's AI assistant.
> Architecture decisions, code, tests and this document were prepared together with Claude, tested on a physical
> phone, and directed by the project owner.

---

## 1. Setup and running

### Requirements (all free)

- Node.js 20+ (developed with v24)
- Android Studio (ships with the Android SDK)
- **JDK 21** (or 17) for Gradle (see the Windows notes below)
- Android SDK Manager → SDK Tools ("Show Package Details" checked):
  - **NDK (Side by side) 27.1.12297006** (required by React Native 0.86; Gradle downloads it if missing)
  - Android SDK Platform 36, Platform-Tools
- An Android phone with USB debugging enabled (Android 10+ recommended)

Expo Go is **not** used: the app has its own native module, so it needs a *development build*.
EAS (cloud builds) is not needed either; everything builds locally for free.

### First run

```bash
npm install
```

```bash
npx expo run:android
```

`expo run:android`:

1. Generates the `android/` folder from `app.json`, config plugins and native modules (Continuous Native Generation:
   `android/` is not committed and not edited by hand)
2. Builds a debug APK with Gradle
3. Installs it on the phone connected over USB and starts Metro

### Day-to-day development

- **TypeScript only:** `npm start` is enough. Changes load instantly while the app is open on the phone.
- **Kotlin, `AndroidManifest.xml`, `build.gradle`, `app.json` or a config plugin changed:** rebuild the development build:

```bash
npx expo run:android
```

If `app.json` or a plugin changed, regenerate the native folder cleanly first:

```bash
npx expo prebuild --platform android --clean
```

### Windows notes

- Gradle must run on **JDK 21** (or 17). With Java 24/25, React Native's `prefab` tool (C++ dependency step) prints
  "A restricted method in java.lang.System has been called" to stderr and Gradle treats it as a failure. Android Studio
  Quail 4 ships JBR 25, so do not use it for this project.
  - Set `JAVA_HOME` to a JDK 21 (e.g. Eclipse Temurin 21).
  - In Android Studio: Settings → Build, Execution, Deployment → Build Tools → Gradle → **Gradle JVM** = 21.
  - When Android Studio Quail 4 opens the `android/` project, it writes `toolchainVersion=25` to
    `android/gradle/gradle-daemon-jvm.properties`, and Gradle then downloads and uses its own Java 25.
    `plugins/withGradleDaemonJdk21.js` rewrites this file as `toolchainVersion=21` on every `prebuild`. If Studio
    changes it again, run `npx expo prebuild --platform android`.
- Before running `npx expo prebuild`, use **File → Close Project** in Android Studio. An open project keeps Gradle
  processes that lock files under `android/.../build`, and `prebuild` stops with "EBUSY: resource busy or locked".
  Stop leftover `java.exe` Gradle/Kotlin daemons with `gradlew --stop`. A process whose working directory is inside
  `android/` (for example an `adb` server started from there) also blocks it. Since `android/` is generated, it can
  always be recreated with `npx expo prebuild --platform android --clean`.
- If you get "Unable to establish loopback connection", point TEMP to a short folder:
  `set TEMP=C:\gtmp` and `set TMP=C:\gtmp` (the JDK cannot create its Unix socket file under a short 8.3-style TEMP path).

### Tests

TypeScript (calculation formulas, dates, weight-goal math):

```bash
npm test
```

Kotlin (reconciliation, Stop/Hide rules, day rollover, daylight saving time, sync planning, reminder schedule),
after `android/` has been generated:

```bash
cd android && gradlew.bat :step-tracker:testDebugUnitTest
```

Type check:

```bash
npx tsc --noEmit
```

---

## 2. Architecture

```
src/app/                   Screens (Expo Router)
  (tabs)/index.tsx         Today: progress ring, status, distance/kcal, daily limit, last 7 days
  (tabs)/calendar.tsx      Calendar + monthly/weekly summaries
  (tabs)/weight.tsx        Goal: target weight, trend chart, daily limit, step impact, weigh-ins, reminders
  (tabs)/settings.tsx      Start/Stop, notification/lock screen, permissions, data deletion
  onboarding.tsx           First launch: intro, activity permission, preferences
  day/[date].tsx           Day details
src/state/                 React contexts (state coming from the native module), goal model hook
src/lib/calc.ts            Distance, walking kcal, BMR (pure functions)
src/lib/goal.ts            Weight trend, loss rate, projection, daily limit, safety checks (pure functions)
src/ui/                    Theme, components, charts (react-native-svg), blurred overlay (expo-blur)
modules/step-tracker/
  src/                     TypeScript bridge types
  android/.../core/        Pure Kotlin logic (no Android dependencies, tested with JUnit)
    StepReconciler.kt      Live sensor + Recording API reconciliation
    TrackingPolicy.kt      Start / Stop / Hide rules
    SyncPlanner.kt         Which time ranges to read from the Recording API
    DayKeys.kt             Day keys in the local time zone
    ReminderSchedule.kt    Weigh-in reminder days
  android/.../data/        Room: tables, DAOs, database (with migrations); SharedPreferences settings
  android/.../tracking/
    StepEngine.kt          The single step engine in the process (everything goes through it)
    LiveStepSensor.kt      SensorManager
    RecordingSource.kt     Recording API on mobile
    StepNotificationService.kt  health foreground service + notification
    Receivers.kt           Notification actions (Stop/Hide) and boot (BOOT_COMPLETED)
    SyncWorker.kt          WorkManager
    WeighReminder.kt       Weigh-in reminder (AlarmManager)
  StepTrackerModule.kt     React Native bridge (Expo Modules API)
plugins/
  withReleaseWithoutInternet.js     Removes the INTERNET permission from release builds
  withGradleDaemonJdk21.js          Pins the Gradle daemon to JDK 21
  withReleaseSigningAndShrink.js    Personal release signing + R8 shrinking
```

### Data flow

```
Step sensor ──(each event)──► StepEngine ──► StepReconciler ──► "onStateChange" ──► React screen
                                  │                                    └──────────► Notification (≤ once per 3 s)
                                  ├──(50 steps / 30 s)──► Room daily_steps
Recording API ◄──(app open, WorkManager every 3 h, before Stop)── StepEngine
      └──► Room recording_segments (session × day) ──► daily_steps (only increases)
```

### Reconciliation rule: the same step is never counted twice

The sensor and the Recording API report the same physical steps at different times. Both are **lower bounds** of the
true count: neither reports more steps than were actually taken. Therefore:

- They are **not added together**; the larger one is shown. The larger of two lower bounds is still a lower bound.
- Live count = **baseline** (a stored value with a known timestamp) + sensor steps received **after** the baseline.
  Sensor events from before the baseline time (e.g. old batched events) are rejected.
- If the Recording value overtakes the live count, the baseline moves up to it, and later steps are added on top again.
- The daily total in the database **only increases**. A late, smaller value never pulls the displayed number back.
- Recording API values are stored as **session × day** segments. Re-reading the same segment keeps the larger value;
  values are never added twice.
- The Recording API is read **only within Start–Stop periods**, so steps taken while stopped never appear as recorded.

### Why the step counter and not the step detector?

The first version used `TYPE_STEP_DETECTOR` for live counting, and on a physical phone the count came out slightly too
high. According to the Android documentation, the step detector has under 2 seconds of latency but is less accurate,
while the step counter "has more latency (up to 10 seconds) but more accuracy", because it uses that time to filter
out false positives. The Recording API also uses the hardware step counter (`dumpsys sensorservice` shows
`gms.fitness...LocalSensorAdapter` → Step Counter). Since reconciliation takes the larger of two lower bounds, the
detector's false positives were pulling the total up.

Live counting now uses the difference between consecutive step counter values, so both sources share the same
filtered scale. The number still rises while walking, but the first steps may arrive a few seconds late and sometimes
in small batches. A one-time correction (`dataRevision` 2) resets days that have Recording data to the Recording value,
removing the old detector surplus.

Sources:
- https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion
- https://montemagno.com/part-1-my-stepcounter-android-step-sensors/

### Day rollover and time zones

- Each step belongs to the day in the **phone's local time zone** at the moment it was taken (`ZoneId.systemDefault()`).
- Day boundaries are computed with `ZonedDateTime`. 23- and 25-hour days around daylight saving changes are handled (tested).
- A new day starts from 0 at 00:00; the previous day's total is written to Room. The hardware counter is never reset.
- While the app or the notification is active, a midnight timer, `DATE_CHANGED`, `TIME_CHANGED`, `TIMEZONE_CHANGED`
  and the screen turning on all trigger a rollover check.
- Sensor events from before midnight that are delivered after midnight are not written to the new day; the previous
  day is completed by the Recording API sync.
- Recording segments become "final" 3 hours after they end and are not read again, so the boundaries of old days do
  not shift when the time zone changes.

---

## 3. Stop vs. Hide

| | **Hide ("Gizle")** | **Stop ("Durdur")** |
|---|---|---|
| Live notification + foreground service | Closed | Closed |
| Live sensor listening | Closed unless the app is on screen | Closed |
| Recording API subscription (background recording) | **Continues** | Latest data is saved to Room first, then the **subscription ends** |
| WorkManager sync | Continues | Cancelled |
| Previous days | Kept | Kept |
| Undo | Settings → "Bildirimde göster" (Show in notification), or "Bildirimi tekrar göster" (Show notification again) on the home screen | "Devam et" (Resume) |

Steps taken while stopped are never added later. Resuming opens a new recording session. When stopped, the home
screen shows an amber "Yürüyüş duraklatıldı" (Walking paused) card.
Notification actions run through a `BroadcastReceiver`, so they work even when the app UI is not open.
Android 14+ lets users swipe away foreground service notifications; swiping is treated as **Hide**.

---

## 4. Android permissions

| Permission | Why | When it is requested |
|---|---|---|
| `ACTIVITY_RECOGNITION` | Step sensor and Recording API | On first launch, after an explanation |
| `POST_NOTIFICATIONS` (Android 13+) | Live notification and weigh-in reminders | Only when the user turns these on |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_HEALTH` | Live notification service | At install (not prompted) |
| `RECEIVE_BOOT_COMPLETED` | Restore recording, the notification and reminders after a reboot | At install |

- Location, accounts, contacts, storage and internet are **not** requested.
- The storage, vibration and `SYSTEM_ALERT_WINDOW` permissions that Expo adds by default are removed with
  `app.json → blockedPermissions`.
- The **INTERNET** permission exists only in debug builds, because a development build downloads JavaScript from Metro
  on the computer. It is removed from release builds by `plugins/withReleaseWithoutInternet.js`.
  (`WAKE_LOCK` in the release manifest comes from the WorkManager library; the app itself holds no wake locks.)
- If a permission is denied, the app keeps working (calendar and weight goal are usable) and shows why a feature is
  off, with a button that opens the Android settings.

---

## 5. Calculation assumptions

All values are **estimates**. Nothing is made up for information the user did not provide; missing values are shown
as "—" or "veri eksik" (data missing).

### Distance

- Stride length = **height × 0.414**, a common approximation in pedometer literature (about 0.413 for women and
  0.415 for men). Individual differences and walking speed can cause errors above 10%.
- The user can enter a stride length or **calibrate** it: walk a known distance (e.g. 100 m), count the steps, and
  stride = distance / steps. A calibrated value takes priority over the height estimate.
- Without height or stride length, distance is not calculated.

### Walking energy (kcal)

- **Net** walking cost = **0.5 kcal × kg × km**.
- Derived from the horizontal component of the ACSM walking equation: 0.1 mL O₂/kg/m and 1 L O₂ ≈ 5 kcal → 0.5 kcal/kg/km.
- "Net" means resting expenditure is excluded, so it does not overlap with the BMR below.
- Slope, speed, load and individual efficiency are ignored. The latest weight measurement up to that day is used.

### Weight goal (no food logging; working backwards from the scale)

Most people do not know the calories in what they eat and tend to underestimate them. So the app does not ask for
food logs; it derives the energy balance **from the scale itself**:

- **Goal:** the user enters a target weight (e.g. 89 → 80 kg). The day the goal was set and the trend weight on that
  day are stored, and progress is measured from there. Only weight-loss goals are supported.
- **Trend weight:** measurements are smoothed with a time-weighted exponential moving average (τ = 7 days), so daily
  ±1 kg swings from water and salt do not hide the real direction.
- **Actual loss rate:** a least-squares line through the measurements of the last 28 days. At least 3 measurements
  spanning 10 days are required; until then the app shows "collecting data" instead of a number.
- **Daily deficit from the scale:** loss rate (kg/day) × **7,700 kcal/kg**, a common approximation. Early weeks can
  look faster because of water loss, and long-term progress slower because the body adapts.
- **Arrival estimate:** remaining weight ÷ weekly rate. No date is given if weight is not going down.
- **Contribution of steps:** average steps over the last 14 days → net walking kcal/day → × 7 ÷ 7,700 = weekly weight
  equivalent. The app also shows what "+2,000 steps per day" would change.

### Daily calorie limit

`limit = Mifflin-St Jeor resting energy × activity factor (excluding steps) + net walking energy of the day`

- Mifflin-St Jeor: `10×kg + 6.25×cm − 5×age + s` (s = +5 for men, −161 for women). Weight, height, birth year and
  sex are required; if any is missing, the limit is not calculated and the app says what is missing.
- The activity factor describes only the non-walking part of the day (1.2 / 1.3 / 1.45). If not chosen, 1.2
  ("sitting") is assumed and the UI says so. Walking is added separately from steps, once; nothing is counted twice.
- The limit rises live as the user walks. Eating below it creates an energy deficit. An info box (ⓘ) explains this
  with the user's own numbers: for example, eating 2,450 kcal is a surplus without walking but a deficit after
  10,000 steps.
- The profile that feeds this calculation (height, birth year, sex, activity, step goal, stride) is edited from the
  limit card ("Düzenle" / Edit) in a bottom sheet over a blurred background.

### Safety

- The target weight cannot be below a BMI of 18.5 (the lower bound of the WHO healthy range) for the user's height.
- A warning is shown if the scale shows a weekly loss above 1% of body weight.
- The app does not suggest calorie restriction targets or diets. It notes that pregnancy, breastfeeding, chronic
  illness or a history of eating disorders require a health professional. The profile is for adults (18+).

### Weigh-in reminder

- Two days a week, 3 days apart (Monday and Thursday by default), at a chosen morning hour (06–09).
- Triggered with `AlarmManager.setWindow` within a 30-minute window; no exact-alarm (`SCHEDULE_EXACT_ALARM`) permission.
- The next reminder is scheduled after each one, and rescheduled after a reboot, an app update, or a time/time zone
  change. Notification permission is requested when the reminder is turned on.
- Tapping the notification opens the Goal tab directly (`adimsayar://weight`). The notification contains no weight data.

---

## 6. Battery usage

### Design decisions

- **With the notification off or hidden**, no service or sensor listener runs in the background. Recording is done by
  Google Play services' low-power Recording API (hardware step counter; the app process is not woken).
- **While the app is on screen**, the sensor is read immediately (`maxReportLatency = 0`); the listener is removed when
  the app goes to the background.
- **With the live notification on**, the sensor is read with `maxReportLatency = 10 s`, so the hardware can batch
  steps and the CPU does not wake for every step.
- **Notification updates** are triggered by step events but coalesced: at most **once every 3 seconds**, and **never
  while the screen is off**; the latest value is shown when the screen turns on. So the notification may not show
  every single step instantly. Android also rate-limits notification updates per app.
- **Database writes:** every 50 steps or 30 seconds, and when going to the background.
- **Sync:** no per-second polling. On app open, every 3 hours with WorkManager, before Stop, and (with the notification
  on) at most every 10 minutes when the screen turns on.
- No wake locks, location or GPS.

### How to measure (on a physical phone)

Measure each of these four states for **at least 2 hours** with similar phone usage:

1. App open, on screen
2. Live notification on, app in background, screen off
3. Notification hidden (Recording API only), screen off
4. Stopped

- **Simple:** Settings → Battery → Battery usage → the app's percentage and background time.
- **Detailed (Battery Historian):**

```bash
adb shell dumpsys batterystats --reset
```

  After the test period:

```bash
adb bugreport bugreport.zip
```

  Upload the file to Battery Historian. For sensor usage and wakeups:

```bash
adb shell dumpsys sensorservice
```

```bash
adb shell dumpsys batterystats com.adimsayar.app
```

### Findings

> **Not measured yet.** This section will be filled in after measuring on a physical phone; battery measurements on an
> emulator are meaningless. Expectation: (3) and (4) near zero, (2) low thanks to sensor batching but higher than (3),
> (1) dominated by the screen.

| State | Duration | App battery share | Notes |
|---|---|---|---|
| Open, on screen | | | |
| Notification on, screen off | | | |
| Notification hidden | | | |
| Stopped | | | |

---

## 7. Known limitations

- The **Recording API** keeps only the last **10 days** and can only be read while subscribed. If the app does not run
  for more than 10 days and WorkManager could not run either (e.g. the app was force-stopped), data in between can be lost.
- The Recording API requires **Google Play services**. Without them (e.g. some devices for the Chinese market), the app
  counts only while it is on screen or the live notification is on. The app says so on screen.
- Recording API data can be delayed. When the app opens, it first shows the stored value and updates within seconds.
- On devices without a step sensor there is no live counting; only the (delayed) Recording API is used.
- Some manufacturers (Xiaomi, Huawei, Samsung, etc.) aggressively stop foreground services and WorkManager to save
  battery. The notification is **not guaranteed to stay on every phone.** Android 14+ lets users swipe it away.
- **Lock screen:** Android's system settings ("hide sensitive content", "hide silent notifications", lock screen
  notifications) can override the app's preference. The lock screen display is the live notification itself: with
  the notification off, there is no count on the lock screen.
- After a time zone change, day segments that are not yet final (the last ~3 hours) are re-read in the new time zone,
  which can move a few steps near the boundary to the neighbouring day.
- Starting the foreground service from `BOOT_COMPLETED` must be allowed for the `health` type on Android 15. If it is
  not, recording continues through the Recording API and the notification returns when the app is opened.
- The official documentation does not state explicitly that a Recording API subscription survives a reboot. To avoid
  losing data, the app deliberately does **not** re-subscribe on reboot. This should be verified on a physical phone.

---

## 8. Manual tests on a physical phone

Step sensors, the Recording API, the lock screen and battery behaviour **cannot** be tested realistically on an
emulator. Run these on a physical phone; each step lists the expected result.

**Preparation:** connect the phone, `npx expo run:android`. On first launch, grant the activity permission and turn
on both preferences.

1. **Walking with the app open:** walk 20 steps holding the phone. The count should rise by ~20. The hardware counter
   reports the first steps a few seconds late and sometimes in batches, then step by step.
2. **Notification:** the notification shows "N adım" (N steps) with **Durdur** (Stop) and **Gizle** (Hide) buttons.
   Put the app in the background and walk; with the screen on, the count should update within a few seconds.
3. **Lock screen:** lock the phone, walk 30 steps, turn the screen on without unlocking. The count should appear on
   the lock screen. Turn off "Kilit ekranında göster" (Show on lock screen) in Settings; it should disappear.
4. **Walking with the screen locked:** 200 steps with the phone in a pocket, screen off. Open the app; the count
   should have risen by ~200.
5. **Hide:** tap Hide in the notification. The notification disappears and the app shows "Bildirim gizli"
   (Notification hidden). Walk 100 steps with the app closed, wait a few minutes, open the app: the steps should be
   there (Recording API).
6. **Show the notification again:** from the home screen or Settings. It should come back with the current count.
7. **Stop:** tap Stop in the notification. The notification closes; the app shows "Yürüyüş duraklatıldı" (Walking
   paused). Walk 100 steps; the count must **not** increase.
8. **Resume:** "Devam et" (Resume). The count continues from the value before stopping; the 100 steps taken while
   stopped must not be added, not even minutes later after a Recording sync.
9. **Denying the activity permission:** reinstall and deny the permission. A "Hareket izni gerekli" (Activity
   permission required) card with an explanation appears. Calendar and Goal still work. After two denials, "İzin ver"
   (Grant) opens the Android settings.
10. **Denying the notification permission (Android 13+):** deny it while turning on "Bildirimde göster". The switch
    stays off, an explanation is shown, and step counting continues.
11. **No sensor:** on an emulator (no step sensor), a "Canlı sensör yok" (No live sensor) notice should appear.
12. **Reboot:** reboot with the notification on. After unlocking, the notification returns within a minute or two.
    Walk 100 steps, open the app: previous total + ~100, not reset.
13. **Close and reopen the app:** swipe it away from recents, walk 50 steps, reopen: the count must not drop or double.
14. **Midnight:** keep the app open at 23:55. At 00:00 the count becomes 0 and yesterday appears in the calendar with
    its total. Repeat with the screen locked and the notification on: when the screen turns on, the notification shows
    the new day.
15. **Time zone:** Settings → Date and time → turn off automatic time zone and choose another one (so the date
    changes). The app shows the new date; yesterday's steps are not written to the wrong day.
16. **After a few days:** each day keeps its own total in the calendar; days that reached the step goal are marked.
17. **Delete history:** Settings → "Adım geçmişini sil" (Delete step history) → confirm. The calendar empties and
    today starts from 0. Old steps must not come back minutes later.
18. **Battery:** see section 6.
19. **Goal:** add a weigh-in and a target weight on the Goal tab. A target below BMI 18.5 is rejected. The daily limit
    card on the Today tab rises while walking. The ⓘ info box opens over a blurred background.
20. **Weigh-in reminder:** turn it on and choose a day pair that includes today and the nearest hour. The "Tartılma
    zamanı" (Time to weigh in) notification should arrive within the 30-minute window and open the Goal tab. After a
    reboot, the next reminder should still arrive.
21. **After two weeks:** with at least 3 weigh-ins, the Goal tab shows the "Tartıya göre" (From the scale) card, the
    weekly rate and an estimated arrival date.

---

## 9. Sharing with friends (APK, free)

### Signing key

- Release APKs are signed with a personal key stored **outside the repository**:
  `%USERPROFILE%\.adim-sayar-imza\adim-sayar-upload.jks` (RSA 4096, 10,000 days). The password and alias live in
  `~/.gradle/gradle.properties` as `ADIMSAYAR_UPLOAD_*` properties.
- `plugins/withReleaseSigningAndShrink.js` signs the release build with this key when these properties exist and falls
  back to the debug key otherwise.
- **Back up the key and its properties.** If the key is lost, installed apps can no longer be updated; users must
  uninstall and reinstall, which deletes their data. Never commit or share the key or its password.
- The same key can later be used as the Google Play upload key.

### Size

- R8 minification and resource shrinking are enabled (`android.enableMinifyInReleaseBuilds`,
  `android.enableShrinkResourcesInReleaseBuilds`). arm64-only build: **30.0 MB** (38.8 MB before). The installed size
  on the phone is larger.
- For older 32-bit phones, if needed: `-PreactNativeArchitectures=arm64-v8a,armeabi-v7a`.

### Publishing a new version

1. In `app.json`, bump `version` (e.g. 1.0.1) and **increase** `android.versionCode` (e.g. 2). Phones refuse the
   update if versionCode does not increase.
2. Close the project in Android Studio, then build:

```bash
npx expo prebuild --platform android
```

```bash
android\gradlew.bat -p android :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

3. Send `android/app/build/outputs/apk/release/app-release.apk` as `AdimSayar-<version>.apk`. Friends open the file
   and tap **Update**; since it is signed with the same key, their data is kept.

There is no in-app update: that would require the internet permission, and the app deliberately requests none. A free
option if needed: upload APKs to GitHub Releases and let friends track updates with the open-source **Obtainium** app.

## 10. Preparing for Google Play

1. Replace `app.json → android.package` (`com.adimsayar.app`) with your permanent package name; it cannot change after publishing.
2. App icon and splash images (`assets/`).
3. Use Play App Signing with the personal upload key. Never commit the key file (`*.jks`).
4. Release build (AAB):

```bash
npx expo prebuild --platform android --clean
```

```bash
cd android && gradlew.bat bundleRelease
```

5. **Health apps declaration:** Play Console asks for a declaration for the `health` foreground service type and
   `ACTIVITY_RECOGNITION`. A short video explaining the foreground service may be required.
6. **Data safety form:** no data collected or shared (everything on device); deletion is available.
7. **Privacy policy** (required): which data is stored on the device and that nothing is sent anywhere.
8. Target API level: Play's current requirement (Expo SDK 57 → targetSdk 36).
9. A few days in the internal testing track; check notifications and battery on phones from different manufacturers.
10. State in the store listing that distance and calories are **estimates** and not for medical use. Google Play
    requires a one-time USD 25 developer registration fee.

---

## 11. Privacy

- No accounts, servers, ads or analytics.
- Steps, weight measurements and the profile are stored only in `adim_sayar.db` (Room), in the app's private storage.
  `allowBackup: false`, so nothing goes to Android cloud backup either.
- The lock screen notification shows only the step count.
- Settings → "Adım geçmişini sil" (Delete step history) / "Tüm verileri sil" (Delete all data) ask for confirmation
  and cannot be undone.

---

## Copyright

© 2026 Yunus Emre İnel. All rights reserved.

The source code in this repository is publicly visible for review, but no open-source license is granted. Copying,
modifying, distributing or using the code in another project requires written permission.
Third-party libraries used in the project (Expo, React Native, AndroidX, Google Play services, etc.) are subject to
their own licenses.
