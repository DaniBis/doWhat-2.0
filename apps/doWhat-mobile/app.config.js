export default {
  expo: {
    name: "doWhat",
    slug: "dowhat",
    scheme: "dowhat",
    ios: {
      bundleIdentifier: "com.dowhat.app",
    },
    android: {
      package: "com.dowhat.app",
    },
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
}
  }
};
