const { getDefaultConfig } = require("expo/metro-config");
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
config.resolver.blockList = [new RegExp(`^${escapedRoot}/(?:node_modules|desktop|rust-api/target|build|dist)/.*`)];
config.transformer.babelTransformerPath = require.resolve("react-native-svg-transformer/expo");
config.resolver.assetExts = config.resolver.assetExts.filter(ext => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = config;
