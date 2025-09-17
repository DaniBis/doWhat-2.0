const path = require("path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../'); // repo root
const pnpmDir = path.join(workspaceRoot, 'node_modules', '.pnpm');

const config = getDefaultConfig(projectRoot);

// Ensure Metro can resolve expo-router (and other symlinked deps) with pnpm
// by explicitly mapping the package path. This avoids occasional resolution
// failures like "Unable to resolve module expo-router/entry".
let expoRouterPath;
try {
  expoRouterPath = path.dirname(
    require.resolve('expo-router/package.json', { paths: [projectRoot, workspaceRoot] })
  );
} catch (e) {
  expoRouterPath = null;
}

// Watch the whole monorepo and pnpm virtual store
config.watchFolders = [workspaceRoot, pnpmDir].concat(expoRouterPath ? [expoRouterPath] : []);

// Ensure RN resolves node_modules from repo root too
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
];

// Map critical packages explicitly to avoid duplicate installs and symlink gotchas
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...(expoRouterPath ? { 'expo-router': expoRouterPath } : {}),
  ...(function(){
    const mods = {};
    for (const pkg of ['expo-image-picker','expo-image-manipulator','react-native-gesture-handler','react-native-reanimated']) {
      try {
        mods[pkg] = path.dirname(require.resolve(`${pkg}/package.json`, { paths: [projectRoot, workspaceRoot] }));
      } catch {}
    }
    // Explicitly map expo & expo-modules-core so that monorepo + pnpm symlink layout
    // never confuses Metro (current red screen: Unable to resolve module 'expo')
    for (const corePkg of ['expo','expo-modules-core']) {
      try {
        mods[corePkg] = path.dirname(require.resolve(`${corePkg}/package.json`, { paths: [projectRoot, workspaceRoot] }));
      } catch (e) {
        console.warn(`[metro.config] Failed to resolve ${corePkg}`, e.message);
      }
    }
  // Force react-native single instance resolution from workspace root to avoid pnpm nested lookups
  try { mods['react-native'] = path.dirname(require.resolve('react-native/package.json', { paths: [workspaceRoot, projectRoot] })); } catch {}
  try { mods['react'] = path.dirname(require.resolve('react/package.json', { paths: [workspaceRoot, projectRoot] })); } catch {}
    return mods;
  })()
};

console.log('[metro.config] extraNodeModules:', Object.keys(config.resolver.extraNodeModules));

if (!config.resolver.extraNodeModules['react-native']) {
  console.warn('[metro.config] react-native mapping missing; attempting dynamic resolution');
  try {
    const rnPath = path.dirname(require.resolve('react-native/package.json', { paths: [workspaceRoot, projectRoot] }));
    config.resolver.extraNodeModules['react-native'] = rnPath;
  } catch (e) {
    console.warn('[metro.config] Failed to resolve react-native path dynamically', e);
  }
}

if (!config.resolver.extraNodeModules['expo']) {
  console.warn('[metro.config] expo mapping missing; attempting dynamic resolution');
  try {
    const expoPath = path.dirname(require.resolve('expo/package.json', { paths: [workspaceRoot, projectRoot] }));
    config.resolver.extraNodeModules['expo'] = expoPath;
  } catch (e) {
    console.warn('[metro.config] Failed to resolve expo path dynamically', e);
  }
}

// pnpm + monorepo resolution stability
config.resolver.disableHierarchicalLookup = false;
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// Helpful in monorepos
config.transformer.unstable_allowRequireContext = true;

// Enable HMR properly for Hermes engine
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

// Ensure proper resolver configuration for Hermes
config.resolver.sourceExts = ['jsx', 'js', 'ts', 'tsx', 'json', 'cjs'];

module.exports = config;
