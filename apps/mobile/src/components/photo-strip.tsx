import { Icon, IconButton, radius, space, Text, useTheme, useToast } from '@tablemates/ui';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';

import { pickPhotos, uploadPhoto } from '@/lib/uploads';

export interface StripPhoto {
  /** Local key while uploading; the server id once uploaded. */
  key: string;
  uri: string;
  id?: string;
}

/**
 * Thumbnails plus an add button. Photos upload as soon as they're picked, so
 * the form can submit immediately. `uploading` reports whether any are in flight.
 */
export function PhotoStrip({
  photos,
  onChange,
  max,
  onUploadingChange,
}: {
  photos: StripPhoto[];
  onChange: (photos: StripPhoto[]) => void;
  max: number;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(0);

  async function add() {
    const picked = await pickPhotos({ limit: max - photos.length });
    if (!picked.length) return;
    const pending = picked.map((p, i) => ({ key: `local-${Date.now()}-${i}`, uri: p.uri }));
    let current = [...photos, ...pending];
    onChange(current);
    setBusy((b) => b + picked.length);
    onUploadingChange?.(true);
    await Promise.all(
      picked.map(async (p, i) => {
        try {
          const uploaded = await uploadPhoto(p, 'review');
          current = current.map((x) => (x.key === pending[i]!.key ? { ...x, id: uploaded.id, uri: uploaded.uri } : x));
        } catch {
          current = current.filter((x) => x.key !== pending[i]!.key);
          toast("A photo couldn't upload. Try again.", 'danger');
        }
        onChange(current);
        setBusy((b) => {
          if (b - 1 === 0) onUploadingChange?.(false);
          return b - 1;
        });
      }),
    );
  }

  return (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {photos.map((p, i) => (
          <View key={p.key}>
            <Image source={{ uri: p.uri }} accessibilityLabel={`Photo ${i + 1}`} style={{ width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }} />
            {!p.id && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: radius.md }}>
                <ActivityIndicator color="#fff" accessibilityLabel="Uploading" />
              </View>
            )}
            <View style={{ position: 'absolute', top: -8, right: -8 }}>
              <IconButton icon="close" size="sm" variant="secondary" accessibilityLabel={`Remove photo ${i + 1}`} onPress={() => onChange(photos.filter((x) => x.key !== p.key))} />
            </View>
          </View>
        ))}
        {photos.length < max && (
          <Pressable
            role="button"
            accessibilityLabel="Add photos"
            onPress={add}
            style={({ pressed }) => ({
              width: 80,
              height: 80,
              borderRadius: radius.md,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.borderInput,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
            })}>
            <Icon name="camera-outline" color="textMuted" />
            <Text variant="caption" tone="muted">
              Add
            </Text>
          </Pressable>
        )}
      </View>
      {busy > 0 && (
        <Text variant="caption" tone="muted" aria-live="polite">
          Uploading {busy} photo{busy === 1 ? '' : 's'}…
        </Text>
      )}
    </View>
  );
}
