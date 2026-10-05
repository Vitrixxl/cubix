// Asks Android for the display's fastest refresh rate at its current resolution. Without it, several Android skins
// (HyperOS, ColorOS, OxygenOS…) keep apps they do not know at 60 Hz, and every transition and scroll with them.
const { withMainActivity } = require("expo/config-plugins");

const MARKER = "cubix: fastest refresh rate";
const CODE = `
    // ${MARKER}
    @Suppress("DEPRECATION")
    val screen = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) display else windowManager.defaultDisplay
    screen?.let { d ->
      val current = d.mode
      d.supportedModes
        .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
        .maxByOrNull { it.refreshRate }
        ?.let { fastest -> window.attributes = window.attributes.apply { preferredDisplayModeId = fastest.modeId } }
    }`;

module.exports = config => withMainActivity(config, config => {
  const activity = config.modResults;
  if (activity.language !== "kt") throw new Error("withHighRefreshRate expects a Kotlin MainActivity");
  if (activity.contents.includes(MARKER)) return config;
  const patched = activity.contents.replace(/^(\s*super\.onCreate\([^)]*\))$/m, `$1${CODE}`);
  if (patched === activity.contents) throw new Error("withHighRefreshRate could not find super.onCreate in MainActivity");
  activity.contents = patched;
  return config;
});
