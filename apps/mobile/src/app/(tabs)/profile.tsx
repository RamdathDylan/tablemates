import {
  Button,
  Card,
  Divider,
  EmptyState,
  formatDate,
  Input,
  Sheet,
  space,
  TextArea,
  useToast,
  VisitListItem,
} from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { View } from 'react-native';

import { NotificationSettings } from '@/components/notification-settings';
import { ProfileHeader } from '@/components/profile-header';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { VisitList } from '@/components/visit-list';
import { api, ApiError } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { qk } from '@/lib/query-keys';

export default function ProfileScreen() {
  const me = useMe();
  const { signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const profile = useQuery({ queryKey: qk.profile(me.username), queryFn: () => api.profile(me.username) });
  const visits = useQuery({ queryKey: qk.myVisits, queryFn: api.myVisits });

  return (
    <Screen documentTitle="Profile">
      {profile.isPending ? (
        <LoadingCards count={1} />
      ) : profile.isError ? (
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      ) : (
        <ProfileHeader
          profile={profile.data}
          actions={
            <>
              <Button title="Edit profile" variant="secondary" size="sm" icon="create-outline" onPress={() => setEditing(true)} />
              <Button title="Sign out" variant="ghost" size="sm" onPress={signOut} />
            </>
          }
        />
      )}

      <Section title="Your visits">
        {visits.isPending ? (
          <LoadingCards count={1} />
        ) : visits.isError ? (
          <ErrorState error={visits.error} onRetry={() => visits.refetch()} />
        ) : visits.data.length === 0 ? (
          <EmptyState
            icon="restaurant-outline"
            title="No visits yet"
            message="Log the places you eat so friends know where to go."
            action={{ label: 'Log a visit', onPress: () => router.navigate('/log') }}
          />
        ) : (
          <VisitList visits={visits.data} editable />
        )}
      </Section>

      <WantToTry />

      <NotificationSettings />

      {__DEV__ && (
        <Button title="Open style guide" variant="ghost" icon="color-palette-outline" onPress={() => router.push('/styleguide')} style={{ alignSelf: 'center' }} />
      )}

      <EditProfileSheet visible={editing} onClose={() => setEditing(false)} />
    </Screen>
  );
}

function EditProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const me = useMe();
  const { setUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [homeCity, setHomeCity] = useState(me.homeCity ?? '');
  const [bio, setBio] = useState(me.bio);
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl ?? '');

  const save = useMutation({
    mutationFn: () =>
      api.updateMe({
        displayName: displayName.trim(),
        homeCity: homeCity.trim() || null,
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim() || null,
      }),
    onSuccess: (user) => {
      setUser(user);
      queryClient.invalidateQueries({ queryKey: qk.profile(user.username) });
      toast('Profile updated', 'success');
      onClose();
    },
  });
  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : {};

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edit profile"
      footer={<Button title="Save" onPress={() => save.mutate()} loading={save.isPending} fullWidth size="lg" />}>
      <View style={{ gap: space[4] }}>
        <Input label="Name" value={displayName} onChangeText={setDisplayName} error={fieldErrors.displayName} />
        <Input label="Home city" value={homeCity} onChangeText={setHomeCity} icon="location-outline" />
        <TextArea label="Bio" value={bio} onChangeText={setBio} maxLength={280} helperText={`${bio.length}/280`} />
        <Input
          label="Photo URL"
          value={avatarUrl}
          onChangeText={setAvatarUrl}
          autoCapitalize="none"
          keyboardType="url"
          error={fieldErrors.avatarUrl ?? (save.isError && !Object.keys(fieldErrors).length ? save.error.message : undefined)}
        />
      </View>
    </Sheet>
  );
}

function WantToTry() {
  const saved = useQuery({ queryKey: qk.saved, queryFn: api.saved });
  if (!saved.data?.length) return null;
  return (
    <Section title={`Want to try · ${saved.data.length}`}>
      <Card padding={0} style={{ paddingVertical: 4 }}>
        {saved.data.map((s, i) => (
          <Fragment key={s.restaurant.id}>
            {i > 0 && <Divider inset={3} />}
            <VisitListItem
              restaurantName={s.restaurant.name}
              visitedAt={s.savedAt}
              subtitle={`Saved ${formatDate(s.savedAt)}`}
              onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: s.restaurant.id } })}
            />
          </Fragment>
        ))}
      </Card>
    </Section>
  );
}
