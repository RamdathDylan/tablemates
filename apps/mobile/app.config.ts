import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Extends app.json with values that come from the environment (keys stay out of git). */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      // Google Maps on Android ("Maps SDK for Android"). iOS uses Apple Maps and needs no key.
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY },
    },
  },
});
