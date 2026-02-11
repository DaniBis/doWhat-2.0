const platform = {
  OS: 'web',
  select(options) {
    return options?.web ?? options?.default;
  },
  constants: {
    reactNativeVersion: { major: 0, minor: 73, patch: 6 },
  },
};

module.exports = platform;
module.exports.default = platform;
