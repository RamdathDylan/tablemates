import { Image, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { palette, space } from '../tokens';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface PhotoViewerProps {
  photos: { url: string; caption?: string }[];
  /** Index of the open photo, or null when closed. */
  index: number | null;
  onChange: (index: number | null) => void;
}

/** Full-screen photo lightbox with previous/next. Escape (web) and the close button dismiss it. */
export function PhotoViewer({ photos, index, onChange }: PhotoViewerProps) {
  const { width, height } = useWindowDimensions();
  const photo = index === null ? null : photos[index];
  if (!photo || index === null) return null;
  const has = (i: number) => i >= 0 && i < photos.length;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onChange(null)} statusBarTranslucent>
      <View role="dialog" aria-modal aria-label={`Photo ${index + 1} of ${photos.length}`} style={styles.root}>
        <Pressable accessibilityLabel="Close photo" style={StyleSheet.absoluteFill} onPress={() => onChange(null)} />
        <Image
          source={{ uri: photo.url }}
          resizeMode="contain"
          accessibilityLabel={photo.caption ?? `Photo ${index + 1}`}
          style={{ width: Math.min(width, 1200), height: height * 0.8 }}
        />
        <View style={[styles.bar, { top: Platform.OS === 'web' ? space[4] : space[12] }]}>
          <Text variant="label" style={{ color: palette.stone[0] }}>
            {index + 1} / {photos.length}
          </Text>
          <IconButton icon="close" variant="secondary" accessibilityLabel="Close photo" onPress={() => onChange(null)} />
        </View>
        {photo.caption && (
          <Text variant="label" align="center" style={styles.caption}>
            {photo.caption}
          </Text>
        )}
        {has(index - 1) && (
          <View style={[styles.nav, { left: space[3] }]}>
            <IconButton icon="chevron-back" variant="secondary" size="lg" accessibilityLabel="Previous photo" onPress={() => onChange(index - 1)} />
          </View>
        )}
        {has(index + 1) && (
          <View style={[styles.nav, { right: space[3] }]}>
            <IconButton icon="chevron-forward" variant="secondary" size="lg" accessibilityLabel="Next photo" onPress={() => onChange(index + 1)} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Solid backdrop: the photo is the only thing on screen.
  root: { flex: 1, backgroundColor: palette.stone[950], alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: space[4], right: space[4], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nav: { position: 'absolute', top: '50%', marginTop: -24 },
  caption: { position: 'absolute', bottom: space[10], left: space[4], right: space[4], color: palette.stone[0] },
});
