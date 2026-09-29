# Adım Sayar

Android için reklamsız, hesapsız, sunucusuz bir adım sayar. Veriler yalnızca telefonda tutulur.

- **Arayüz:** React Native + Expo (SDK 57) + TypeScript, Expo Router ile sekmeli gezinme
- **Android tarafı:** Kotlin ile yazılmış yerel Expo modülü (`modules/step-tracker`)
- **Veri:** Android Room (SQLite)
- **Arka plan kaydı:** Google Play hizmetleri **Recording API on mobile** (`play-services-fitness` → `FitnessLocal`)
- **Canlı sayım:** `SensorManager` + `TYPE_STEP_COUNTER` farkları (sayaç yoksa yedek olarak `TYPE_STEP_DETECTOR`)
- **Canlı bildirim:** `health` türünde foreground service
- **Zamanlanmış eşitleme:** WorkManager (3 saatte bir)

> Eski **Google Fit** API'leri kullanılmıyor. Google Fit API'leri 2026 sonunda kapanıyor ve 1 Mayıs 2024'ten beri yeni
> geliştirici kabul etmiyor. Recording API on mobile ayrı bir API'dir: Google hesabı istemez, veriyi cihazda tutar.
> Kaynak: https://developer.android.com/health-and-fitness/guides/recording-api

> **Geliştirme notu:** Bu proje, Anthropic'in yapay zekâ asistanı **Claude** (Claude Code) yardımıyla geliştirilmiştir.
> Mimari kararlar, kod, testler ve bu doküman Claude ile birlikte hazırlanmış; fiziksel telefonda test edilmiş ve
> proje sahibi tarafından yönlendirilmiştir.

---

## 1. Kurulum ve çalıştırma

### Gerekenler (hepsi ücretsiz)

- Node.js 20+ (geliştirme bilgisayarında v24 ile denendi)
- Android Studio (JDK 21 ve Android SDK ile gelir)
- Android SDK Manager → SDK Tools ("Show Package Details" işaretli):
  - **NDK (Side by side) 27.1.12297006** (React Native 0.86 bu sürümü ister; kurulu değilse Gradle kendisi indirir)
  - Android SDK Platform 36, Platform-Tools
- USB hata ayıklaması açık bir Android telefon (Android 10+ önerilir)

Expo Go **kullanılmaz**; uygulamada kendi yerel modülümüz olduğu için bir *development build* gerekir.
EAS (bulut derleme) de gerekmez: her şey bilgisayarında, ücretsiz derlenir.

### İlk kurulum

```bash
npm install
```

```bash
npx expo run:android
```

`expo run:android` şunları yapar:

1. `android/` klasörünü `app.json`, config plugin'ler ve yerel modüllerden üretir (CNG: `android/` git'te tutulmaz, elle düzenlenmez)
2. Gradle ile debug APK'yı derler
3. USB'ye bağlı telefona kurar ve Metro'yu başlatır

### Günlük geliştirme

- **Yalnızca TypeScript değiştiyse:** `npm start` yeterli. Uygulama telefonda açıkken değişiklikler anında yüklenir.
- **Kotlin, `AndroidManifest.xml`, `build.gradle`, `app.json` veya bir config plugin değiştiyse** development build yeniden oluşturulmalı:

```bash
npx expo run:android
```

`app.json` ya da plugin değiştiyse önce native klasörü temiz üret:

```bash
npx expo prebuild --platform android --clean
```

### Windows notları

- Gradle **JDK 21** (veya 17) ile çalışmalı. Java 24/25 ile React Native'in C++ adımındaki `prefab` aracı stderr'e
  "A restricted method in java.lang.System has been called" uyarısı basar ve Gradle bunu hata sayar. Android Studio
  Quail 4 ile gelen JBR 25 olduğu için bu projede onu kullanma.
  - Bu bilgisayarda Eclipse Temurin **21.0.12** kurulu ve kullanıcı `JAVA_HOME`'u ona ayarlı:
    `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`. Yeni açılan terminaller bunu otomatik kullanır.
  - Android Studio'da: Settings → Build, Execution, Deployment → Build Tools → Gradle → **Gradle JDK** = `JAVA_HOME` (21).
  - Android Studio Quail 4, `android/` projesini açınca `android/gradle/gradle-daemon-jvm.properties` dosyasına
    `toolchainVersion=25` yazar. Gradle bu durumda kendi Java 25'ini indirip kullanır ve yukarıdaki hata tekrar çıkar.
    `plugins/withGradleDaemonJdk21.js` her `prebuild`'de bu dosyayı `toolchainVersion=21` olarak yazar. Studio dosyayı
    tekrar değiştirirse `npx expo prebuild --platform android` çalıştır.

- `npx expo prebuild` çalıştırmadan önce Android Studio'da **File → Close Project** yap. Açık proje, Gradle
  sürecinin `android/.../build` altındaki dosyaları kilitlemesine yol açar; `prebuild` bu dosyaları silemez ve
  "EBUSY: resource busy or locked" hatasıyla yarıda kalır. Kapattıktan sonra bile kalan sahipsiz
  `java.exe` (Gradle/Kotlin daemon) süreçleri varsa `gradlew --stop` ile durdur. `android/` klasörü üretilen bir
  klasör olduğu için yarıda kalırsa `npx expo prebuild --platform android --clean` ile baştan üretilebilir.

### Metro'suz bağımsız test sürümü (ekranlar APK'nın içinde)

Telefonu bilgisayardan ayırıp gün boyu test etmek için:

```bash
cd android && gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

Çıktı: `android/app/build/outputs/apk/release/app-release.apk` (bir kopyası `dist/adim-sayar-test.apk`).
Şimdilik debug anahtarıyla imzalanır; kişisel test içindir, Play Store'a yüklenemez. Telefona kurmak için:

```bash
adb install -r dist/adim-sayar-test.apk
```

Development build ile aynı paket adını ve aynı debug anahtarını kullandığı için birinin üstüne diğeri kurulur ve
veriler korunur. Kod değiştirirken development build'e (`npx expo run:android`) geri dönülür.
- "Unable to establish loopback connection" hatası alırsan TEMP yolunu kısa bir klasöre yönlendir:
  `set TEMP=C:\gtmp` ve `set TMP=C:\gtmp` (JDK'nın Unix soket dosyası kısa/8.3 biçimli TEMP yolunda açılamıyor.)

### Testler

TypeScript (hesaplama formülleri, tarih işlemleri):

```bash
npm test
```

Kotlin (uzlaştırma, Durdur/Gizle kuralları, gün devri, yaz saati, eşitleme planı). `android/` klasörü üretildikten sonra:

```bash
cd android && gradlew.bat :step-tracker:testDebugUnitTest
```

Tip denetimi:

```bash
npx tsc --noEmit
```

---

## 2. Mimari

```
src/app/                 Ekranlar (Expo Router)
  (tabs)/index.tsx       Bugün: büyük sayı, hedef, durum, mesafe/kcal
  (tabs)/calendar.tsx    Takvim + aylık/haftalık özet
  (tabs)/weight.tsx      Kilo ölçümleri, profil, enerji ihtiyacı
  (tabs)/settings.tsx    Başlat/Durdur, bildirim/kilit ekranı, izinler, veri silme
  onboarding.tsx         İlk açılış: tanıtım, hareket izni, tercihler
  day/[date].tsx         Gün ayrıntısı + kalori girişi + tahmini denge
src/state/               React context'ler (yerel modülden gelen durum)
src/lib/calc.ts          Mesafe, yürüyüş kalorisi, BMR, kalori dengesi (saf fonksiyonlar)
modules/step-tracker/
  src/                   TypeScript köprü tipleri
  android/.../core/      Saf Kotlin mantığı (Android'e bağımlı değil, JUnit ile test edilir)
    StepReconciler.kt    Canlı sensör + Recording API uzlaştırması
    TrackingPolicy.kt    Başlat / Durdur / Gizle kuralları
    SyncPlanner.kt       Recording API'den hangi aralıkların okunacağı
    DayKeys.kt           Yerel saat dilimine göre gün anahtarları
  android/.../data/      Room: tablolar, DAO'lar, veritabanı; SharedPreferences ayarları
  android/.../tracking/
    StepEngine.kt        Süreçteki tek adım motoru (her şey buradan geçer)
    LiveStepSensor.kt    SensorManager
    RecordingSource.kt   Recording API on mobile
    StepNotificationService.kt  health foreground service + bildirim
    Receivers.kt         Bildirim eylemleri (Durdur/Gizle) ve açılış (BOOT_COMPLETED)
    SyncWorker.kt        WorkManager
  StepTrackerModule.kt   React Native köprüsü (Expo Modules API)
plugins/withReleaseWithoutInternet.js   Release'ten INTERNET iznini kaldırır
```

### Veri akışı

```
Adım sensörü ──(her adım)──► StepEngine ──► StepReconciler ──► "onStateChange" ──► React ekranı
                                 │                                    └──────────► Bildirim (≤ 3 sn'de bir)
                                 ├──(50 adım / 30 sn)──► Room daily_steps
Recording API ◄──(açılış, WorkManager 3 sa, Durdur öncesi)── StepEngine
      └──► Room recording_segments (oturum × gün) ──► daily_steps (yalnızca artar)
```

### Uzlaştırma kuralı: aynı adım iki kez sayılmaz

Sensör ve Recording API aynı fiziksel adımları farklı zamanlarda bildirir. İkisi de gerçek sayının **alt sınırıdır**,
yani gerçekte atılandan fazlasını söylemez. Bu yüzden:

- **Toplanmazlar;** büyük olan gösterilir. Büyük olanın da bir alt sınır olduğu kesindir.
- Canlı sayım = **taban** (zamanı bilinen, kayıtlı bir değer) + tabandan **sonra** gelen sensör adımları.
  Taban anından önceye ait sensör olayları (ör. biriktirilmiş eski olaylar) reddedilir.
- Recording değeri canlı sayımı geçerse taban o değere çekilir. Sonraki adımlar yine birer birer eklenir.
- Günlük toplam veritabanında **yalnızca artar.** Geç gelen küçük bir değer ekrandaki sayıyı geri almaz.
- Recording API'den gelen değerler **oturum × gün** parçaları olarak saklanır. Aynı parça yeniden okunursa büyük
  olan tutulur, değerler eklenmez.
- Recording API **yalnızca Başlat–Durdur aralıklarında** okunur, böylece durdurulan dönemdeki adımlar hiçbir
  zaman kaydedilmiş gibi görünmez.

### Neden step counter, step detector değil?

İlk sürümde canlı sayım `TYPE_STEP_DETECTOR` ile yapılıyordu ve fiziksel testte sayı biraz fazla çıktı. Android
dokümantasyonuna göre step detector'ın gecikmesi 2 saniyenin altındadır ama daha az doğrudur. Step counter ise
"daha fazla gecikmeli (en fazla ~10 sn) ama daha doğrudur", çünkü aradaki sürede yanlış pozitifleri ayıklar.
Recording API de donanım step counter'ını kullanır (`dumpsys sensorservice` çıktısında
`gms.fitness...LocalSensorAdapter` → Step Counter). Uzlaştırma iki alt sınırın büyüğünü aldığı için, detector'ın
yanlış pozitifleri toplamı yukarı çekiyordu.

Artık canlı sayım step counter'ın ardışık değerleri arasındaki farktan yapılır; iki kaynak aynı filtrelenmiş ölçeği
paylaşır. Sayı yürürken yine artar, ancak ilk adımlar birkaç saniye gecikmeyle ve bazen birkaç adımlık gruplar
halinde gelebilir. `dataRevision` 2 ile bir kerelik düzeltme yapılır: Recording verisi olan günlerin toplamı
Recording değerine eşitlenir ve eski detector fazlalığı silinir.

Kaynaklar:
- https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion
- https://montemagno.com/part-1-my-stepcounter-android-step-sensors/

### Gün değişimi ve saat dilimi

- Her adımın günü, adımın atıldığı andaki **telefonun yerel saat dilimine** göre belirlenir (`ZoneId.systemDefault()`).
- Gün sınırları `ZonedDateTime` ile hesaplanır. Yaz saati geçişindeki 23 ve 25 saatlik günler doğru ele alınır (testli).
- 00:00'da yeni gün 0'dan başlar; önceki günün toplamı Room'a yazılır. Donanım sayacı hiçbir zaman sıfırlanmaya çalışılmaz.
- Uygulama ya da bildirim açıkken gece yarısı zamanlayıcısı, `DATE_CHANGED`, `TIME_CHANGED`, `TIMEZONE_CHANGED` ve
  ekranın açılması gün devrini tetikler.
- Gece yarısından önce atılıp sonra teslim edilen sensör olayları yeni güne yazılmaz. Önceki gün, Recording API
  eşitlemesiyle tamamlanır.
- Recording parçaları bittikten 3 saat sonra "kesinleşir" ve bir daha okunmaz. Saat dilimi değişince eski günlerin
  sınırları kaymaz.

---

## 3. Durdur ve Gizle

| | **Gizle** | **Durdur** |
|---|---|---|
| Canlı bildirim + foreground service | Kapanır | Kapanır |
| Canlı sensör dinleme | Uygulama ekranda değilse kapanır | Kapanır |
| Recording API aboneliği (arka plan kaydı) | **Devam eder** | Önce son veri Room'a alınır, sonra **abonelik bitirilir** |
| WorkManager eşitlemesi | Devam eder | İptal edilir |
| Önceki günler | Korunur | Korunur |
| Geri alma | Ayarlar'da "Bildirimde göster" ya da ana ekranda "Bildirimi tekrar göster" | "Başlat / Devam et" |

Durdurulan süre boyunca atılan adımlar sonradan eklenmez. Başlat, yeni bir kayıt dönemi (oturum) açar.
Bildirim eylemleri bir `BroadcastReceiver` ile çalışır, uygulama arayüzü açık olmasa da işler.
Android 14+ kullanıcıların foreground service bildirimini kaydırarak kapatmasına izin verir; bu da **Gizle** olarak yorumlanır.

---

## 4. Android izinleri

| İzin | Neden | Ne zaman istenir |
|---|---|---|
| `ACTIVITY_RECOGNITION` | Adım sensörü ve Recording API | İlk açılışta, açıklamadan sonra |
| `POST_NOTIFICATIONS` (Android 13+) | Canlı bildirim | Yalnızca kullanıcı "Bildirimde göster"i açınca |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_HEALTH` | Canlı bildirim servisi | Kurulumda (kullanıcıya sorulmaz) |
| `RECEIVE_BOOT_COMPLETED` | Yeniden başlatmadan sonra kaydı/bildirimi geri getirmek | Kurulumda |

- Konum, hesap, kişi, depolama ve internet izni **istenmez**.
- Expo'nun varsayılan olarak eklediği depolama, titreşim ve `SYSTEM_ALERT_WINDOW` izinleri `app.json → blockedPermissions` ile kaldırıldı.
- **INTERNET** izni yalnızca debug derlemesinde kalır, çünkü development build JavaScript'i bilgisayardaki Metro'dan indirir.
  Release derlemesinden `plugins/withReleaseWithoutInternet.js` ile kaldırılır.
- İzin reddedilirse uygulama çalışmaya devam eder: takvim, kilo ve kalori kullanılabilir. Ekranda nedenini ve
  Android ayarlarına giden bir düğme gösterir.

---

## 5. Hesaplama varsayımları

Hepsi **tahmindir**. Kullanıcının vermediği bilgi için sayı uydurulmaz; eksikse "—" veya "veri eksik" gösterilir.

### Mesafe

- Adım uzunluğu = **boy × 0,414**. Pedometre literatüründe yaygın kullanılan yaklaşık oran: kadınlarda ~0,413,
  erkeklerde ~0,415. Kişiye ve hıza göre %10'u aşan sapmalar olabilir.
- Kullanıcı adım uzunluğunu elle girebilir ya da **kalibre edebilir**: bilinen bir mesafeyi (ör. 100 m) yürüyüp
  adımlarını sayar; adım uzunluğu = mesafe / adım. Kalibre değer boydan tahmine göre önceliklidir.
- Boy da adım uzunluğu da yoksa mesafe hesaplanmaz.

### Yürüyüş enerjisi (kcal)

- **Net** yürüyüş maliyeti = **0,5 kcal × kg × km**.
- Kaynağı ACSM yürüme denkleminin yatay bileşeni: 0,1 mL O₂/kg/m ve 1 L O₂ ≈ 5 kcal → 0,5 kcal/kg/km.
- "Net" demek, dinlenme harcaması hariç demek. Bu yüzden aşağıdaki BMR ile üst üste binmez.
- Eğim, hız, yük ve kişisel verim hesaba katılmaz. Kilo olarak o güne kadarki son ölçüm kullanılır.

### Kilo hedefi (yemek saymadan, tartıdan geriye)

Kullanıcıların çoğu yediklerinin kalorisini bilmez ve tahmin ederken genellikle eksik söyler. Bu yüzden uygulama
yemek girişi istemez. Enerji dengesini **tartının kendisinden** çıkarır:

- **Hedef:** Kullanıcı hedef kilosunu yazar (ör. 89 → 80 kg). Hedefin belirlendiği gün ve o günkü eğilim kilosu
  saklanır; ilerleme buradan ölçülür. Yalnızca kilo verme hedefi desteklenir.
- **Eğilim kilosu:** Ölçümler zaman ağırlıklı üstel ortalamayla yumuşatılır (τ = 7 gün). Su ve tuza bağlı ±1 kg'lık
  günlük oynamalar asıl yönü gizlemez.
- **Gerçek kayıp hızı:** Son 28 gündeki ölçümlere en küçük kareler doğrusu çizilir. En az 3 ölçüm ve 10 günlük
  aralık gerekir; öncesinde "veri toplanıyor" gösterilir, sayı uydurulmaz.
- **Tartıya göre günlük açık:** kayıp hızı (kg/gün) × **7.700 kcal/kg**. Bu yaygın bir yaklaşımdır. İlk haftalarda
  su kaybı yüzünden hız fazla, uzun vadede vücudun uyumu nedeniyle az görünebilir.
- **Hedefe varış:** kalan kilo ÷ haftalık hız. Kilo düşmüyorsa tarih verilmez.
- **Adımların katkısı:** son 14 günün ortalama adımı → net yürüyüş kcal/gün → × 7 ÷ 7.700 = haftalık kilo karşılığı.
  Ayrıca "günde +2.000 adım" atılırsa ne değişeceği gösterilir.

### Günlük sınır

`sınır = Mifflin-St Jeor dinlenme enerjisi × hareket katsayısı (adımlar hariç) + o günün net yürüyüş enerjisi`

- Mifflin-St Jeor: `10×kg + 6,25×cm − 5×yaş + s` (s = +5 erkek, −161 kadın). Kilo, boy, doğum yılı ve cinsiyet
  gerekir; biri eksikse sınır hesaplanmaz, eksik olan söylenir.
- Hareket katsayısı yalnızca günün yürüyüş dışı kısmını tanımlar (1,2 / 1,3 / 1,45). Seçilmezse 1,2 ("oturarak")
  kabul edilir ve bu arayüzde yazılır. Yürüyüş adımlardan ayrıca ve bir kez eklenir; çift sayım yoktur.
- Sınır adım attıkça canlı yükselir. Bu sınırın altında beslenilen günlerde enerji açığı oluşur.

### Güvenlik

- Hedef kilo, boya göre VKİ 18,5'in (WHO sağlıklı aralık alt sınırı) altında girilemez.
- Tartıya göre haftalık kayıp vücut ağırlığının %1'ini aşarsa uyarı gösterilir.
- Uygulama kalori kısıtlama hedefi ya da diyet önermez. Hamilelik, emzirme, kronik hastalık ve yeme bozukluğu
  geçmişi için sağlık profesyoneline danışma notu vardır. Profil 18 yaş ve üzeri içindir.

### Tartılma hatırlatıcısı

- Haftada iki gün, aralarında 3 gün (varsayılan Pazartesi ve Perşembe), sabah 06–09 arası seçilen saatte.
- `AlarmManager.setWindow` ile 30 dakikalık pencerede tetiklenir; kesin alarm (`SCHEDULE_EXACT_ALARM`) izni istemez.
- Her hatırlatmadan sonra sıradaki kurulur. Telefon yeniden başlayınca, uygulama güncellenince, saat ya da saat
  dilimi değişince yeniden kurulur. Açılırken bildirim izni istenir.
- Bildirime dokununca doğrudan Hedef sekmesi açılır (`adimsayar://weight`). Bildirimde kilo bilgisi yer almaz.

---

## 6. Pil tüketimi

### Tasarım kararları

- **Bildirim kapalı ya da gizliyken** arka planda hiçbir servis veya sensör dinleyicisi çalışmaz. Kayıt, Google Play
  hizmetlerinin düşük güçlü Recording API'siyle yapılır (donanım adım sayacı; uygulama süreci uyanmaz).
- **Uygulama ekrandayken** sensör anlık dinlenir (`maxReportLatency = 0`); ekran arka plana geçince dinleyici kaldırılır.
- **Canlı bildirim açıkken** sensör `maxReportLatency = 10 sn` ile dinlenir. Donanım adımları biriktirip toplu
  gönderebilir, işlemci her adımda uyanmaz.
- **Bildirim güncellemesi:** adım olaylarıyla tetiklenir, ama yakın olaylar birleştirilir. En fazla **3 saniyede bir**
  güncellenir ve **ekran kapalıyken hiç güncellenmez**; ekran açılınca en son değer gösterilir. Bu yüzden bildirimdeki
  sayı her tekil adımı anında göstermeyebilir. Android de bir uygulamanın bildirim güncelleme sıklığını sınırlar.
- **Veritabanı yazımı:** 50 adımda bir ya da 30 saniyede bir ve arka plana geçerken.
- **Eşitleme:** saniyelik sorgu yok. Uygulama açılışında, WorkManager ile 3 saatte bir, Durdur'dan önce ve (bildirim
  açıkken) ekran açılışında en fazla 10 dakikada bir.
- Wake lock, konum ve GPS kullanılmaz.

### Ölçüm yöntemi (fiziksel telefonda yapılacak)

Aşağıdaki dört durum için her biri **en az 2 saat**, telefon benzer kullanımda olacak şekilde:

1. Uygulama açık, ekranda
2. Canlı bildirim açık, uygulama arka planda, ekran kapalı
3. Bildirim gizli (yalnızca Recording API), ekran kapalı
4. Durdurulmuş

Ölçmek için:

- **Basit yöntem:** Ayarlar → Pil → Pil kullanımı → Adım Sayar yüzdesi ve "arka planda" süresi.
- **Ayrıntılı yöntem (Battery Historian):**

```bash
adb shell dumpsys batterystats --reset
```

  Test süresi bittikten sonra:

```bash
adb bugreport bugreport.zip
```

  Oluşan dosyayı Battery Historian'a yükle. Sensör kullanımı ve uyanmalar için ayrıca:

```bash
adb shell dumpsys sensorservice
```

```bash
adb shell dumpsys batterystats com.adimsayar.app
```

### Bulgular

> **Henüz ölçülmedi.** Bu bölüm fiziksel telefonda yapılan ölçümden sonra doldurulacak. Emülatörde pil ölçümü anlamlı
> değildir. Beklenti: (3) ve (4) neredeyse sıfır, (2) sensör batching sayesinde düşük ama (3)'ten fazla, (1) ekran
> tüketimi baskın.

| Durum | Süre | Uygulama pil payı | Not |
|---|---|---|---|
| Açık, ekranda | | | |
| Bildirim açık, ekran kapalı | | | |
| Bildirim gizli | | | |
| Durduruldu | | | |

---

## 7. Bilinen sınırlamalar

- **Recording API** yalnızca son **10 günü** tutar ve yalnızca abonelik sürerken okunabilir. Uygulama 10 günden uzun
  süre hiç çalışmazsa, üstelik WorkManager da çalışamamışsa (ör. uygulama zorla durdurulduysa), aradaki veri kaybolabilir.
- Recording API **Google Play hizmetleri** ister. Yoksa (ör. bazı Çin pazarı cihazlar) uygulama ekranda ve canlı
  bildirim açıkken sayar, kapalıyken sayamaz. Bu durum ekranda belirtilir.
- Recording API verisi gecikmeli gelebilir. Uygulama açıldığında sayı önce kayıtlı değeri gösterir, birkaç saniye içinde güncellenir.
- Adım sensörü olmayan cihazlarda canlı sayım yoktur; yalnızca Recording API (gecikmeli) kullanılır.
- Bazı üreticiler (Xiaomi, Huawei, Samsung vb.) agresif pil tasarrufuyla foreground service'i ve WorkManager'ı
  durdurabilir. Bildirimin **her telefonda kalıcı olacağı garanti edilmez.** Android 14+ kullanıcı bildirimi kaydırarak kapatabilir.
- **Kilit ekranı:** Android'in sistem ayarları ("Hassas içeriği gizle", "Sessiz bildirimleri gizle", kilit ekranında
  bildirim gösterme) uygulama tercihini geçersiz kılabilir. Kilit ekranı gösterimi canlı bildirime bağlıdır: bildirim
  kapalıyken kilit ekranında sayı yoktur.
- Saat dilimi değişikliğinde henüz kesinleşmemiş (son ~3 saatteki) gün parçaları yeni saat dilimine göre yeniden
  okunur. Bu, sınıra yakın birkaç adımın komşu güne kaymasına yol açabilir.
- Yeniden başlatmadan sonra foreground service'in `BOOT_COMPLETED` üzerinden başlatılması Android 15'te `health` türü
  için izinli olmalı. Başlatılamazsa kayıt Recording API ile sürer, bildirim uygulama açılınca geri gelir.
- Aboneliğin telefon yeniden başladıktan sonra sürdüğü resmî belgelerde açıkça yazmıyor. Uygulama, verileri
  kaybetmemek için yeniden başlatmada aboneliği bilerek **yenilemiyor**. Fiziksel testte doğrulanmalı (bkz. test listesi).

---

## 8. Fiziksel telefonda yapılacak testler

Emülatörde adım sensörü, Recording API, kilit ekranı ve pil davranışı gerçekçi test **edilemez**. Aşağıdakiler
fiziksel telefonda yapılmalı. Her adımda beklenen sonucu yazdım.

**Hazırlık:** Telefonu bağla, `npx expo run:android`. İlk açılışta hareket iznini ver, iki tercihi de aç.

1. **Uygulama açıkken yürüme:** Telefonu elinde tutup 20 adım at. Sayı ~20 artmalı. Donanım sayacı ilk adımları birkaç saniye gecikmeyle ve bazen gruplar halinde bildirir, sonra adım adım artar.
2. **Bildirim:** Bildirim alanında "N adım" ile **Durdur** ve **Gizle** düğmeleri görünmeli. Uygulamayı arka plana al ve
   yürü; ekran açıkken sayı en geç birkaç saniyede güncellenmeli.
3. **Kilit ekranı:** Kilitle, 30 adım yürü, ekranı aç (kilidi açmadan). Kilit ekranında sayı görünmeli.
   Ayarlar'dan "Kilit ekranında göster"i kapat; kilit ekranında görünmemeli.
4. **Ekran kilitliyken yürüme:** Telefon cepte, ekran kapalı 200 adım. Uygulamayı aç; sayı ~200 artmış olmalı.
5. **Gizle:** Bildirimden Gizle. Bildirim kaybolmalı. Uygulamada "Sayılıyor · Canlı bildirim gizli" yazmalı.
   Uygulama kapalıyken 100 adım yürü, birkaç dakika bekle, uygulamayı aç: adımlar eklenmiş olmalı (Recording API).
6. **Bildirimi tekrar aç:** Ana ekrandaki "Bildirimi tekrar göster" ya da Ayarlar. Bildirim güncel sayıyla geri gelmeli.
7. **Durdur:** Bildirimden Durdur. Bildirim kapanmalı. Uygulama açılınca "Durduruldu" yazmalı. 100 adım yürü; sayı **artmamalı**.
8. **Tekrar Başlat:** "Başlat / Devam et". Sayı durdurmadan önceki değerden devam etmeli, durdurulan süredeki 100 adım eklenmemeli.
   Birkaç dakika sonra da (Recording eşitlemesinden sonra) eklenmemeli.
9. **Hareket iznini reddetme:** Uygulamayı kaldır-kur, izinde "İzin verme" de. "İzin gerekli" şeridi ve açıklama çıkmalı.
   Takvim, kilo ve kalori çalışmalı. "Hareket iznini ver" düğmesi (iki kez reddettikten sonra) Android ayarlarını açmalı.
10. **Bildirim iznini reddetme (Android 13+):** "Bildirimde göster"i açarken izni reddet. Anahtar kapalı kalmalı,
    açıklama gösterilmeli, adım sayımı sürmeli.
11. **Sensör yok:** Fiziksel olarak test edilemiyorsa emülatörde (adım sensörü yoktur) "Canlı adım sensörü yok…" uyarısı görülmeli.
12. **Yeniden başlatma:** Bildirim açıkken telefonu yeniden başlat. Kilidi açınca bildirim (bir iki dakika içinde) geri
    gelmeli. Açıldıktan sonra 100 adım at, uygulamayı aç: sayı önceki toplam + ~100 olmalı, sıfırlanmamalı.
13. **Uygulamayı kapatıp açma:** Son uygulamalardan kaydırarak kapat, 50 adım, tekrar aç: sayı düşmemeli, iki kat artmamalı.
14. **Gece yarısı:** 23:55'te uygulama açıkken bekle. 00:00'da sayı 0 olmalı. Takvimde dünkü gün toplamıyla görünmeli.
    Aynısını ekran kilitliyken ve bildirim açıkken dene: ekran açılınca bildirim yeni günü (0 ya da yeni adımları) göstermeli.
15. **Saat dilimi:** Ayarlar → Tarih ve saat → otomatik saat dilimini kapat, farklı bir dilim seç (ör. gün değişecek şekilde).
    Uygulama yeni tarihi göstermeli, dünkü adımlar yanlış güne yazılmamalı.
16. **Birkaç gün sonra:** 2–3 gün normal kullan. Takvimde her gün kendi toplamıyla durmalı, hedefe ulaşılan günler işaretli olmalı.
17. **Geçmişi sil:** Ayarlar → Adım geçmişini sil → onayla. Takvim boşalmalı, bugün 0'dan başlamalı. Eski adımlar birkaç dakika sonra geri gelmemeli.
18. **Pil:** Bölüm 6'daki ölçüm yöntemi.
19. **Hedef:** Hedef sekmesinde bir ölçüm ekle ve hedef kilo gir. VKİ 18,5 altı bir hedef reddedilmeli. Bugün ekranındaki
    "Bugünkü sınırın" kartı yürüdükçe artmalı.
20. **Tartılma hatırlatıcısı:** Hatırlatıcıyı aç, bugünü içeren gün çiftini ve 1 saat sonrasını değil en yakın saati seç.
    Belirlenen saatte (30 dakikalık pencere içinde) "Tartılma zamanı" bildirimi gelmeli ve dokununca Hedef sekmesi
    açılmalı. Telefonu yeniden başlatınca bir sonraki hatırlatma yine gelmeli.
21. **2 hafta sonra:** En az 3 ölçümle Hedef sekmesinde "Tartıya göre" kartı, haftalık hız ve tahmini varış tarihi görünmeli.

---

## 9. Arkadaşlarla paylaşma (APK, ücretsiz)

### İmza anahtarı
- Yayın APK'sı kişisel bir anahtarla imzalanır: `%USERPROFILE%\.adim-sayar-imza\adim-sayar-upload.jks`
  (RSA 4096, 10.000 gün). Şifre ve takma ad, proje dışındaki `~/.gradle/gradle.properties` dosyasında
  `ADIMSAYAR_UPLOAD_*` anahtarlarıyla durur; bir kopyası da aynı klasörde `imza-bilgileri.properties` dosyasındadır.
- `plugins/withReleaseSigningAndShrink.js` bu bilgiler varsa release'i bu anahtarla imzalar, yoksa debug anahtarına düşer.
- **Bu iki dosyayı yedekle** (USB bellek, kişisel bulut). Anahtar kaybolursa arkadaşlarının telefonundaki uygulama bir
  daha güncellenemez; kaldırıp yeniden kurmaları gerekir ve verileri silinir. Anahtarı ve şifreyi kimseyle paylaşma,
  git'e koyma.
- Aynı anahtar ileride Google Play'e "upload key" olarak da kullanılabilir.

### Boyut
- R8 küçültme ve kaynak temizleme açık (`android.enableMinifyInReleaseBuilds`,
  `android.enableShrinkResourcesInReleaseBuilds`). Yalnızca arm64 derlemesi: **30,0 MB** (öncesi 38,8 MB).
  Telefonda kurulu boyut daha büyüktür.
- 32-bit eski telefonlar için gerekirse: `-PreactNativeArchitectures=arm64-v8a,armeabi-v7a`.

### Yeni sürüm yayınlama
1. `app.json` içinde `version`'ı (ör. 1.0.1) ve `android.versionCode`'u **bir artır** (ör. 2). versionCode artmazsa
   telefon güncellemeyi kurmaz.
2. Android Studio'da projeyi kapat, sonra derle:

```bash
npx expo prebuild --platform android
```

```bash
android\gradlew.bat -p android :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

3. `android/app/build/outputs/apk/release/app-release.apk` dosyasını `AdimSayar-<sürüm>.apk` adıyla gönder.
   Arkadaşların dosyayı açıp **Güncelle** der; aynı anahtarla imzalı olduğu için veriler korunur.

Uygulamanın içinde otomatik güncelleme yoktur: bunun için internet izni gerekirdi, uygulama ise bilerek hiç internet
izni istemez. İstenirse ücretsiz bir yol: APK'ları GitHub Releases'a yüklemek ve arkadaşların açık kaynak **Obtainium**
uygulamasıyla güncellemeleri takip etmesi.

## 10. Google Play'e hazırlık

1. `app.json → android.package` (`com.adimsayar.app`) kalıcı olacak kendi paket adınla değiştir. Yayından sonra değiştirilemez.
2. Uygulama ikonu ve açılış görselleri (`assets/`).
3. Release imzalama anahtarı oluştur (`keytool`) ve Play App Signing'i kullan. Anahtar dosyasını (`*.jks`) git'e koyma.
4. Release derlemesi (AAB):

```bash
npx expo prebuild --platform android --clean
```

```bash
cd android && gradlew.bat bundleRelease
```

5. **Health apps declaration / Sağlık uygulaması beyanı:** Play Console, `health` foreground service türü ve
   `ACTIVITY_RECOGNITION` için beyan ister. Foreground service kullanımını açıklayan kısa bir video gerekebilir.
6. **Data safety formu:** veri toplanmıyor ya da paylaşılmıyor (her şey cihazda); şifreleme ve silme seçeneği var.
7. **Gizlilik politikası** (zorunlu): hangi verinin cihazda tutulduğu, hiçbir yere gönderilmediği.
8. Hedef API seviyesi: Play'in güncel gereksinimi (Expo SDK 57 → targetSdk 36).
9. Kapalı test (internal testing) kanalında birkaç gün kullanım; farklı üretici telefonlarında bildirim ve pil kontrolü.
10. Play Store açıklamasında mesafe ve kalorinin **tahmin** olduğunu ve tıbbi amaçlı olmadığını belirt.

---

## 11. Gizlilik

- Hesap, sunucu, reklam, analiz aracı yok.
- Adım, kilo, kalori ve profil verileri yalnızca `adim_sayar.db` (Room) içinde, uygulamanın özel alanında tutulur.
  `allowBackup: false`, Android bulut yedeğine de gitmez.
- Kilit ekranı bildiriminde yalnızca adım sayısı bulunur.
- Ayarlar → "Adım geçmişini sil" / "Tüm verileri sil" onay ister ve geri alınamaz.

---

## Telif hakkı

© 2026 Yunus Emre İnel. Tüm hakları saklıdır.

Bu depodaki kaynak kodu inceleme amacıyla herkese açıktır; ancak açık kaynak lisansı verilmemiştir. Kodun
kopyalanması, değiştirilmesi, dağıtılması veya başka bir projede kullanılması için yazılı izin gerekir.
Projede kullanılan üçüncü taraf kütüphaneler (Expo, React Native, AndroidX, Google Play hizmetleri vb.) kendi
lisanslarına tabidir.
