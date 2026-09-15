// Signs release builds with the keystore named by CUBIX_ANDROID_KEYSTORE. Without it the
// generated debug key is kept, so local builds keep installing over each other.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "CUBIX_ANDROID_KEYSTORE";
const RELEASE_CONFIG = `signingConfigs {
        release {
            def keystore = System.getenv("${MARKER}")
            if (keystore) {
                storeFile file(keystore)
                storePassword System.getenv("CUBIX_ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CUBIX_ANDROID_KEY_ALIAS")
                keyPassword System.getenv("CUBIX_ANDROID_KEY_PASSWORD")
            }
        }`;

module.exports = config => withAppBuildGradle(config, config => {
  const gradle = config.modResults;
  if (gradle.language !== "groovy") throw new Error("withReleaseSigning expects a Groovy android/app/build.gradle");
  if (gradle.contents.includes(MARKER)) return config;
  const withConfig = gradle.contents.replace("signingConfigs {", RELEASE_CONFIG);
  const withRelease = withConfig.replace(
    /(release \{[^}]*?)signingConfig signingConfigs\.debug/,
    `$1signingConfig System.getenv("${MARKER}") ? signingConfigs.release : signingConfigs.debug`,
  );
  if (withConfig === gradle.contents || withRelease === withConfig) throw new Error("withReleaseSigning could not patch android/app/build.gradle");
  gradle.contents = withRelease;
  return config;
});
