import * as SecureStore from 'expo-secure-store';

import { isWeb } from './config';

const KEY = 'tablemates.refreshToken';

/**
 * Persists the refresh token on native (Keychain / Keystore). On web the API
 * keeps it in an httpOnly cookie, so there is nothing for JS to store.
 */
export const refreshTokenStore = {
  get: () => (isWeb ? Promise.resolve(null) : SecureStore.getItemAsync(KEY)),
  set: (token: string | undefined) =>
    isWeb || !token ? Promise.resolve() : SecureStore.setItemAsync(KEY, token),
  clear: () => (isWeb ? Promise.resolve() : SecureStore.deleteItemAsync(KEY)),
};
