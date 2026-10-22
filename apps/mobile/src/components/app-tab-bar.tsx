import {
  Badge,
  focusRing,
  fontFamily,
  Icon,
  radius,
  space,
  Text,
  useBreakpoint,
  useTheme,
  type Breakpoint,
  type PressState,
} from '@tablemates/ui';
import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const PHONE_ITEM_HEIGHT = 56;

/** Height of the phone bottom bar, so overlays (toasts) can sit above it. */
export function phoneTabBarHeight(bottomInset: number) {
  return space[2] + PHONE_ITEM_HEIGHT + Math.max(bottomInset, space[2]) + 1;
}

/**
 * App navigation. Phones get a tall bottom bar; tablets an icon rail; desktops
 * a labeled sidebar. Every item is at least 48px tall with a visible focus ring,
 * and the active tab is marked by a filled pill, not color alone.
 */
export function AppTabBar({ state, descriptors, emitter, navigateToTab, insets }: TabBarProps) {
  const { colors } = useTheme();
  const bp = useBreakpoint();
  const sidebar = bp !== 'phone';

  return (
    <View
      role="tablist"
      aria-orientation={sidebar ? 'vertical' : 'horizontal'}
      style={
        sidebar
          ? {
              width: bp === 'desktop' ? 248 : 96,
              paddingTop: insets.top + space[6],
              paddingBottom: insets.bottom + space[4],
              paddingHorizontal: bp === 'desktop' ? space[3] : space[2],
              gap: space[1],
              backgroundColor: colors.surface,
              borderRightWidth: 1,
              borderRightColor: colors.border,
            }
          : {
              flexDirection: 'row',
              paddingTop: space[2],
              paddingBottom: Math.max(insets.bottom, space[2]),
              paddingHorizontal: space[2],
              backgroundColor: colors.surface,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }
      }>
      {sidebar && <Brand compact={bp === 'tablet'} />}
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        const focused = index === state.index;
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
        const badge = typeof options.tabBarBadge === 'number' ? options.tabBarBadge : 0;

        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };

        return (
          <TabItem
            key={route.key}
            bp={bp}
            label={label}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            focused={focused}
            badge={badge}
            onPress={onPress}
            icon={(color) => options.tabBarIcon?.({ focused, color, size: 24 })}
          />
        );
      })}
    </View>
  );
}

function Brand({ compact }: { compact: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: compact ? 'center' : 'flex-start',
        gap: space[2],
        paddingHorizontal: compact ? 0 : space[3],
        marginBottom: space[6],
      }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.md,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name="restaurant" size={20} color="onPrimary" />
      </View>
      {!compact && (
        <Text variant="heading" role="none">
          TableMates
        </Text>
      )}
    </View>
  );
}

interface TabItemProps {
  bp: Breakpoint;
  label: string;
  accessibilityLabel: string;
  focused: boolean;
  badge: number;
  onPress: () => void;
  icon: (color: string) => React.ReactNode;
}

function TabItem({ bp, label, accessibilityLabel, focused, badge, onPress, icon }: TabItemProps) {
  const { colors } = useTheme();
  const fg = focused ? colors.onPrimarySoft : colors.textMuted;
  const desktop = bp === 'desktop';

  return (
    <Pressable
      role="tab"
      aria-selected={focused}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={(state: PressState) => [
        desktop
          ? {
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              minHeight: 48,
              paddingHorizontal: space[3],
              borderRadius: radius.md,
            }
          : {
              flex: bp === 'phone' ? 1 : undefined,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space[1],
              minHeight: bp === 'phone' ? PHONE_ITEM_HEIGHT : 64,
              borderRadius: radius.md,
            },
        desktop && focused && { backgroundColor: colors.primarySoft },
        !focused && (state.hovered || state.pressed) && { backgroundColor: colors.surfaceSunken },
        focusRing(state, colors),
      ]}>
      <View
        style={
          desktop
            ? undefined
            : {
                // Material-style active pill around the icon.
                width: 56,
                height: 32,
                borderRadius: radius.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? colors.primarySoft : 'transparent',
              }
        }>
        {icon(focused ? colors.primary : colors.textMuted)}
        {!desktop && badge > 0 && (
          <View style={{ position: 'absolute', top: -6, right: 4 }}>
            <Badge count={badge} />
          </View>
        )}
      </View>
      <Text
        variant="label"
        numberOfLines={1}
        style={{
          color: fg,
          fontFamily: focused ? fontFamily.bodyBold : fontFamily.bodySemibold,
          fontSize: desktop ? 16 : 13,
          lineHeight: desktop ? 24 : 16,
          flex: desktop ? 1 : undefined,
        }}>
        {label}
      </Text>
      {desktop && <Badge count={badge} />}
    </Pressable>
  );
}
