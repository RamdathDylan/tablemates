import type { Me } from '@tablemates/shared';
import { Avatar, Button, space, useToast } from '@tablemates/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pickPhotos, uploadPhoto } from '@/lib/uploads';

/** Current avatar with a button to upload a new one (saved immediately). */
export function AvatarPicker({ me }: { me: Me }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function change() {
    const [photo] = await pickPhotos({ limit: 1 });
    if (!photo) return;
    setBusy(true);
    try {
      const uploaded = await uploadPhoto(photo, 'avatar');
      setUser(await api.updateMe({ avatarPhotoId: uploaded.id }));
      toast('Profile photo updated', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't upload the photo.", 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <Avatar name={me.displayName} uri={me.avatarUrl} size="lg" decorative />
      <Button title={me.avatarUrl ? 'Change photo' : 'Add a photo'} icon="camera-outline" variant="secondary" size="sm" loading={busy} onPress={change} />
      {me.avatarUrl && !busy && (
        <Button
          title="Remove"
          variant="ghost"
          size="sm"
          onPress={async () => setUser(await api.updateMe({ avatarPhotoId: null }))}
        />
      )}
    </View>
  );
}
