import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useTheme } from '../theme';
import { elevation, radius, space } from '../tokens';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned below the content, e.g. a submit button. */
  footer?: ReactNode;
}

/** A bottom sheet on phones, a centered dialog on wide screens. Escape closes it on web. */
export function Sheet({ visible, onClose, title, children, footer }: SheetProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const dialog = Platform.OS === 'web' && width >= 640;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType={dialog ? 'fade' : 'slide'}
      statusBarTranslucent>
      <View style={[styles.root, { justifyContent: dialog ? 'center' : 'flex-end' }]}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
        />
        <View
          role="dialog"
          aria-modal
          aria-label={title}
          style={[
            styles.panel,
            {
              backgroundColor: colors.surface,
              boxShadow: elevation(3, colors.shadow),
              borderRadius: radius.lg,
              borderBottomLeftRadius: dialog ? radius.lg : 0,
              borderBottomRightRadius: dialog ? radius.lg : 0,
              width: dialog ? 480 : '100%',
              alignSelf: 'center',
            },
          ]}>
          <View style={styles.header}>
            <Text variant="heading" style={{ flex: 1 }}>
              {title}
            </Text>
            <IconButton icon="close" accessibilityLabel="Close" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  panel: { maxHeight: '90%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space[5],
    paddingRight: space[3],
    paddingTop: space[4],
  },
  body: { padding: space[5], gap: space[4] },
  footer: { padding: space[4], paddingBottom: space[6], borderTopWidth: 1 },
});
