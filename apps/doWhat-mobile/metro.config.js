const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../');
const webNativeModuleProxyPath = path.join(
  projectRoot,
  'src/shims/react-native/NativeModuleProxy.web.js',
);
const webPlatformShimPath = path.join(projectRoot, 'src/shims/react-native/Platform.web.js');
const webReactNativeMapsShimPath = path.join(projectRoot, 'src/shims/react-native-maps.web.tsx');

const config = getDefaultConfig(projectRoot);

// Expo monorepo + pnpm resolution.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = true;
config.resolver.platforms = Array.from(new Set([...(config.resolver.platforms ?? []), 'web']));

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolveRequest = defaultResolveRequest ?? context.resolveRequest;
  if (typeof resolveRequest !== 'function') {
    throw new Error('Metro resolver is not available');
  }
  if (platform === 'web') {
    const origin = (context.originModulePath ?? '').replace(/\\/g, '/');
    const inReactNativeLibraries = origin.includes('/node_modules/react-native/Libraries/');

    if (moduleName === 'react-native-maps') {
      return {
        filePath: webReactNativeMapsShimPath,
        type: 'sourceFile',
      };
    }

    if (moduleName === 'react-native') {
      return resolveRequest(context, 'react-native-web', platform);
    }

    if (inReactNativeLibraries && moduleName === '../Utilities/Platform') {
      return {
        filePath: webPlatformShimPath,
        type: 'sourceFile',
      };
    }

    if (
      inReactNativeLibraries &&
      /^\.\/(Native|RCT)[A-Za-z0-9_]+$/.test(moduleName)
    ) {
      return {
        filePath: webNativeModuleProxyPath,
        type: 'sourceFile',
      };
    }

    if (
      moduleName.startsWith('react-native/Libraries/ReactPrivate/') ||
      moduleName.startsWith('react-native/Libraries/Renderer/shims/')
    ) {
      return {
        filePath: webNativeModuleProxyPath,
        type: 'sourceFile',
      };
    }
  }
  return resolveRequest(context, moduleName, platform);
};

module.exports = config;
