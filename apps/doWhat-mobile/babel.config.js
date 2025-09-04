module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Optional: If you're using Reanimated
      'react-native-reanimated/plugin',
    ],
  };
};
