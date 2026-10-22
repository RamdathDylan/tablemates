import { Icon, type IconName, useBreakpoint } from '@tablemates/ui';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { AppTabBar } from '@/components/app-tab-bar';
import { useAcceptedAlerts, useAppFocusRefetch, useNotificationSummary } from '@/lib/notifications';
import { usePush } from '@/lib/push';

const tab = (title: string, label: string, icon: IconName, focusedIcon: IconName) => ({
  title,
  tabBarLabel: label,
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon name={focused ? focusedIcon : icon} size={24} color={String(color)} />
  ),
});

export default function TabLayout() {
  const bp = useBreakpoint();
  useAppFocusRefetch();
  usePush();
  useAcceptedAlerts();
  const pending = useNotificationSummary().data?.pendingFriendRequests ?? 0;
  const friends = tab('Friends', 'Friends', 'people-outline', 'people');

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: bp === 'phone' ? 'bottom' : 'left' }}>
      <Tabs.Screen name="index" options={tab('Feed', 'Feed', 'restaurant-outline', 'restaurant')} />
      <Tabs.Screen name="map" options={tab('Map', 'Map', 'map-outline', 'map')} />
      <Tabs.Screen name="log" options={tab('Log a visit', 'Log', 'add-circle-outline', 'add-circle')} />
      <Tabs.Screen
        name="friends"
        options={{
          ...friends,
          tabBarBadge: pending || undefined,
          tabBarAccessibilityLabel: pending
            ? `Friends, ${pending} pending request${pending === 1 ? '' : 's'}`
            : 'Friends',
        }}
      />
      {/* Reached from the sidebar's Activity item or the phone Feed's bell, not a tab button. */}
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="profile" options={tab('Profile', 'Profile', 'person-circle-outline', 'person-circle')} />
    </Tabs>
  );
}
