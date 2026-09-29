// Yayın (release) derlemesi için:
//  1. Kişisel imza anahtarı: anahtar bilgileri projede DEĞİL, kullanıcının ~/.gradle/gradle.properties dosyasında
//     (ADIMSAYAR_UPLOAD_*) durur. Bulunursa release APK bu anahtarla imzalanır; bulunmazsa (ör. başka bir bilgisayar)
//     Expo'nun debug anahtarına düşülür. Aynı anahtarla imzalanan güncellemeler, veriler korunarak üstüne kurulur.
//  2. R8 küçültme ve kullanılmayan kaynakları atma: APK boyutunu düşürür.
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const SIGNING_BLOCK = `
        release {
            if (project.hasProperty('ADIMSAYAR_UPLOAD_STORE_FILE')) {
                storeFile file(ADIMSAYAR_UPLOAD_STORE_FILE)
                storePassword ADIMSAYAR_UPLOAD_STORE_PASSWORD
                keyAlias ADIMSAYAR_UPLOAD_KEY_ALIAS
                keyPassword ADIMSAYAR_UPLOAD_KEY_PASSWORD
            }
        }`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('ADIMSAYAR_UPLOAD_STORE_FILE')) {
      // signingConfigs { debug { ... } } bloğunun hemen ardına release imzasını ekle.
      src = src.replace(/(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/, `$1${SIGNING_BLOCK}`);
      // release buildType'ının debug imzası yerine (varsa) kişisel imzayı kullanmasını sağla.
      src = src.replace(
        /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
        "$1signingConfig project.hasProperty('ADIMSAYAR_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
      );
      if (!src.includes('signingConfigs.release')) {
        throw new Error('withReleaseSigningAndShrink: app/build.gradle beklenen biçimde değil, imza eklenemedi.');
      }
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withShrink(config) {
  return withGradleProperties(config, (cfg) => {
    const set = (key, value) => {
      cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      cfg.modResults.push({ type: 'property', key, value });
    };
    set('android.enableMinifyInReleaseBuilds', 'true');
    set('android.enableShrinkResourcesInReleaseBuilds', 'true');
    return cfg;
  });
}

module.exports = function withReleaseSigningAndShrink(config) {
  return withShrink(withReleaseSigning(config));
};
