const path = require("path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../'); // repo root
const pnpmDir = path.join(workspaceRoot, 'node_modules', '.pnpm');

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo and pnpm virtual store
config.watchFolders = [workspaceRoot, pnpmDir];

// Ensure RN resolves node_modules from repo root too
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
];

// Fix for pnpm: resolve real paths, not symlinks
config.resolver.symlinks = false;

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