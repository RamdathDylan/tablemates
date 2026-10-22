import { Button, Input, space, Text, TextArea, useToast } from '@tablemates/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';

export default function OnboardingScreen() {
  const me = useMe();
  const { setUser, finishOnboarding } = useAuth();
  const toast = useToast();
  const [homeCity, setHomeCity] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const user = await api.updateMe({
        homeCity: homeCity.trim() || null,
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
      setUser(user);
      finishOnboarding();
      toast(`Welcome to TableMates, ${user.displayName}!`, 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile.");
      setSaving(false);
    }
  }

  return (
    <Screen documentTitle="Set up your profile">
      <View style={{ gap: space[2], marginTop: space[8] }}>
        <Text variant="overline" tone="primary">
          Step 2 of 2
        </Text>
        <Text variant="display">Set up your profile</Text>
        <Text tone="muted">This is what your friends see when they find you, {me.displayName}.</Text>
      </View>
      <Input label="Home city" value={homeCity} onChangeText={setHomeCity} placeholder="e.g. Brooklyn, NY" icon="location-outline" />
      <TextArea
        label="Bio"
        value={bio}
        onChangeText={setBio}
        maxLength={280}
        placeholder="What kind of food do you chase?"
        helperText={`${bio.length}/280`}
      />
      <Input
        label="Photo URL"
        value={avatarUrl}
        onChangeText={setAvatarUrl}
        autoCapitalize="none"
        keyboardType="url"
        helperText="Optional. Photo upload is coming later."
        error={error}
      />
      <Button title="Finish" onPress={save} loading={saving} fullWidth size="lg" />
      <Button title="Skip for now" variant="ghost" onPress={finishOnboarding} fullWidth />
    </Screen>
  );
}
