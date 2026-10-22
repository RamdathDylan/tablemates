import { fontFamily, Icon, type IconName, useTheme } from '@tablemates/ui';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

const tab = (title: string, icon: IconName, focusedIcon: IconName) => ({
  title,
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon name={focused ? focusedIcon : icon} size={24} color={String(color)} />
  ),
});

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fontFamily.bodyMedium },
      }}>
      <Tabs.Screen name="index" options={tab('Feed', 'restaurant-outline', 'restaurant')} />
      <Tabs.Screen name="log" options={tab('Log a visit', 'add-circle-outline', 'add-circle')} />
      <Tabs.Screen name="friends" options={tab('Friends', 'people-outline', 'people')} />
      <Tabs.Screen name="profile" options={tab('Profile', 'person-circle-outline', 'person-circle')} />
    </Tabs>
  );
}
