import { Icon, type IconName, useBreakpoint } from '@tablemates/ui';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { AppTabBar } from '@/components/app-tab-bar';

const tab = (title: string, label: string, icon: IconName, focusedIcon: IconName) => ({
  title,
  tabBarLabel: label,
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon name={focused ? focusedIcon : icon} size={24} color={String(color)} />
  ),
});

export default function TabLayout() {
  const bp = useBreakpoint();
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: bp === 'phone' ? 'bottom' : 'left' }}>
      <Tabs.Screen name="index" options={tab('Feed', 'Feed', 'restaurant-outline', 'restaurant')} />
      <Tabs.Screen name="log" options={tab('Log a visit', 'Log', 'add-circle-outline', 'add-circle')} />
      <Tabs.Screen name="friends" options={tab('Friends', 'Friends', 'people-outline', 'people')} />
      <Tabs.Screen name="profile" options={tab('Profile', 'Profile', 'person-circle-outline', 'person-circle')} />
    </Tabs>
  );
}
