const path = require("path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../../"); // repo root

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so imports from packages/shared work
config.watchFolders = [workspaceRoot];

// Ensure RN resolves node_modules from repo root too
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];

// Helpful in monorepos
config.transformer.unstable_allowRequireContext = true;

module.exports = config;