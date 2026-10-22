import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from './api';

export type PushStatus = 'enabled' | 'denied' | 'undetermined' | 'unavailable';

// Show notifications that arrive while the app is open, too.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Expo's project id, set by `eas init`. Without it there are no push tokens. */
const projectId: string | undefined =
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

let registeredToken: string | null = null;

/** Push needs a real device (or recent simulator), native, and an EAS project. */
export function pushSupported() {
  return Platform.OS !== 'web' && Device.isDevice && !!projectId;
}

async function register(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Android 13+ won't show the permission prompt until a channel exists.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'TableMates',
      importance: AndroidImportance.DEFAULT,
    });
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
    return true;
  } catch {
    // Offline or not configured; we'll try again next launch.
    return false;
  }
}

export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'enabled' : status === 'denied' ? 'denied' : 'undetermined';
}

/** Asks for permission (from a button the user pressed) and registers this device. */
export async function enablePush(): Promise<PushStatus> {
  if (!pushSupported()) return 'unavailable';
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return 'denied';
  return (await register()) ? 'enabled' : 'unavailable';
}

/** Detaches this device from the account; call before signing out. */
export async function unregisterPush() {
  if (!registeredToken) return;
  await api.unregisterPushToken(registeredToken).catch(() => {});
  registeredToken = null;
}

function openFromNotification(data: Record<string, unknown> | undefined) {
  if (typeof data?.planId === 'string' && data.planId) {
    router.push({ pathname: '/plan/[id]', params: { id: data.planId } });
  } else if (data?.screen === 'tagged' || data?.screen === 'passport') {
    router.navigate('/profile');
  } else if (data?.screen === 'feed') {
    router.navigate('/');
  } else if (typeof data?.restaurantId === 'string' && data.restaurantId) {
    router.push({ pathname: '/restaurant/[id]', params: { id: data.restaurantId } });
  } else if (typeof data?.username === 'string') {
    router.push({ pathname: '/user/[username]', params: { username: data.username } });
  } else {
    router.push('/activity');
  }
}

/**
 * Signed-in setup: re-registers if permission was already granted (never
 * prompts), and deep-links when a notification is tapped.
 */
export function usePush() {
  useEffect(() => {
    if (!pushSupported()) return;
    pushStatus().then((s) => s === 'enabled' && register());
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) openFromNotification(r.notification.request.content.data);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((r) =>
      openFromNotification(r.notification.request.content.data),
    );
    return () => sub.remove();
  }, []);
}
