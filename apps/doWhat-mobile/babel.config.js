module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated needs its Babel plugin or Hermes will crash at runtime.
    plugins: ['react-native-reanimated/plugin'],
  };
};
