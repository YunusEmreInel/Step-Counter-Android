// Gradle'ın hangi Java ile çalışacağını JDK 21'e sabitler.
//
// Android Studio Quail 4, projeyi açınca android/gradle/gradle-daemon-jvm.properties dosyasına kendi JDK'sının
// sürümünü (25) yazar. React Native'in C++ bağımlılıklarını hazırlayan "prefab" aracı Java 25'te stderr'e
// "A restricted method in java.lang.System has been called" uyarısı basar ve Android Gradle Plugin bunu hata sayar.
// Bu plugin, prebuild her çalıştığında dosyayı Java 21 isteyecek şekilde yazar. Gradle, kurulu JDK 21'i
// (JAVA_HOME veya Program Files altındaki Temurin) otomatik bulur.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const CONTENT = `# withGradleDaemonJdk21 config plugin tarafindan yazildi (bkz. plugins/withGradleDaemonJdk21.js)
toolchainVersion=21
`;

module.exports = function withGradleDaemonJdk21(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'gradle');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'gradle-daemon-jvm.properties'), CONTENT);
      return cfg;
    },
  ]);
};
