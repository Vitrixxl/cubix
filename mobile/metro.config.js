const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);

// The mobile app imports the shared cube engine, catalogue and local data client from the repository.
config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = false;
// Shared files live outside mobile/: pin their imports to the native app too.
config.resolver.extraNodeModules = new Proxy({}, {
  get: (_target, name) => path.join(projectRoot, "node_modules", name),
});
// Never resolve React or React Native from the repository root's node_modules.
const escapedRoot = repoRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [new RegExp(`^${escapedRoot}/(?:node_modules|desktop|build|dist)/.*`)];
// Native modules without a browser build: the web app uses the browser's own (src/platform/*.web.tsx).
const WEB_SHIMS = {
  "react-native-webview": path.join(projectRoot, "src/platform/webview.web.tsx"),
  "react-native-webrtc": path.join(projectRoot, "src/platform/webrtc.web.tsx"),
};
config.resolver.resolveRequest = (context, moduleName, platform) =>
  platform === "web" && WEB_SHIMS[moduleName]
    ? { type: "sourceFile", filePath: WEB_SHIMS[moduleName] }
    : context.resolveRequest(context, moduleName, platform);
config.transformer.babelTransformerPath = require.resolve("react-native-svg-transformer/expo");
config.resolver.assetExts = config.resolver.assetExts.filter(ext => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

// Tailwind through NativeWind. The colour tokens are set at run time from the accent and the mode (src/theme.ts),
// so no variable may be inlined at build time. 1rem is 16 dp, like the web.
module.exports = withNativewind(config, { inlineVariables: false, inlineRem: 16 });
