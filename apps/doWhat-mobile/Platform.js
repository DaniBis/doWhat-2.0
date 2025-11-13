/* eslint-disable */
// Platform module shim for Metro bundler resolution
try {
	const Platform = require('react-native/Libraries/Utilities/Platform');
	const packageJson = require('react-native/package.json');
	// Add reactNativeVersion property that seems to be missing
	Platform.reactNativeVersion = packageJson.version;
	module.exports = Platform;
} catch (_) {
	// Fallback for lint/static runs
	module.exports = { OS: 'ios', select: (o) => o?.ios ?? o?.default, reactNativeVersion: '0.0.0' };
}
