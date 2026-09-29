// Yayın (release) derlemesinden INTERNET iznini kaldırır.
//
// Uygulama hiçbir sunucuya bağlanmaz; tüm veriler cihazda kalır. Ancak development build, JavaScript
// kodunu bilgisayardaki Metro sunucusundan indirdiği için debug derlemesinde internet izni gereklidir.
// Bu yüzden izin yalnızca release'e özel bir manifest dosyasıyla, "tools:node=remove" kullanılarak kaldırılır.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RELEASE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" tools:node="remove" />
</manifest>
`;

module.exports = function withReleaseWithoutInternet(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'release');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AndroidManifest.xml'), RELEASE_MANIFEST);
      return cfg;
    },
  ]);
};
