module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Expo Router provides routing + static analysis for app/ directory.
    plugins: ['expo-router/babel', 'react-native-reanimated/plugin'],
  };
};
