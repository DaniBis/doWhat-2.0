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
};

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
