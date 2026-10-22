import { maxContentWidth, space, Text, useTheme } from '@tablemates/ui';
import type { ReactNode } from 'react';
import { ScrollView, View, type RefreshControlProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Content column for every screen: page gutters, safe-area padding when there's
 * no navigation header, and a max width so web/tablet layouts don't sprawl.
 */
export function useContentStyle({ header = false }: { header?: boolean } = {}): ViewStyle {
  const insets = useSafeAreaInsets();
  return {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: space[4],
    paddingTop: header ? space[4] : insets.top + space[4],
    paddingBottom: space[10],
    gap: space[4],
  };
}

export function Screen({
  title,
  header,
  children,
  refreshControl,
}: {
  /** Large page title, for screens without a navigation header. */
  title?: string;
  /** True when a navigation header already handles the top safe area. */
  header?: boolean;
  children: ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const { colors } = useTheme();
  const content = useContentStyle({ header });
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={content}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}>
      {title && <Text variant="title">{title}</Text>}
      {children}
    </ScrollView>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="overline" tone="muted" role="heading">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}
