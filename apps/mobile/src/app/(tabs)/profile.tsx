import {
  Button,
  Card,
  Divider,
  EmptyState,
  formatDate,
  Input,
  Text,
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

import { FavoritesRow } from '@/components/favorites';
import { MyListsSection } from '@/components/lists';
import { NotificationSettings } from '@/components/notification-settings';
import { Passport } from '@/components/passport';
import { AvatarPicker } from '@/components/avatar-picker';
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

      {profile.data && <FavoritesRow favorites={profile.data.favorites ?? []} own username={me.username} />}

      <Button
        title={`Your ${new Date().getFullYear()} in food`}
        icon="sparkles"
        variant="secondary"
        onPress={() => router.push('/wrapped')}
        style={{ alignSelf: 'center' }}
      />

      {/* Pending tags are a to-do, so they come before history. */}
      <TaggedIn />

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
          <VisitList visits={visits.data} />
        )}
      </Section>

      <WantToTry />

      <MyListsSection />

      <Passport username={me.username} own />

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

  const save = useMutation({
    mutationFn: () =>
      api.updateMe({
        displayName: displayName.trim(),
        homeCity: homeCity.trim() || null,
        bio: bio.trim(),
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
        <AvatarPicker me={me} />
        <Input label="Name" value={displayName} onChangeText={setDisplayName} error={fieldErrors.displayName} />
        <Input label="Home city" value={homeCity} onChangeText={setHomeCity} icon="location-outline" />
        <TextArea label="Bio" value={bio} onChangeText={setBio} maxLength={280} helperText={`${bio.length}/280`} />
        {save.isError && !Object.keys(fieldErrors).length && (
          <Text tone="danger" role="alert">
            {save.error.message}
          </Text>
        )}
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

/** Visits friends tagged you on: log your own rating or remove the tag. */
function TaggedIn() {
  const queryClient = useQueryClient();
  const tagged = useQuery({ queryKey: qk.tagged, queryFn: api.tagged });
  const untag = useMutation({
    mutationFn: api.untag,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.tagged }),
  });
  if (!tagged.data?.length) return null;
  return (
    <Section title={`Tagged in · ${tagged.data.length}`}>
      <Card style={{ gap: space[3] }}>
        {tagged.data.map((t, i) => (
          <Fragment key={t.visitId}>
            {i > 0 && <Divider />}
            <View style={{ gap: space[2] }}>
              <Text variant="bodyStrong">{t.restaurant.name}</Text>
              <Text variant="caption" tone="muted">
                {t.by.displayName} tagged you · {formatDate(t.visitedAt)}
              </Text>
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                <Button
                  title="Add your rating"
                  size="sm"
                  icon="star"
                  onPress={() =>
                    router.navigate({
                      pathname: '/log',
                      params: {
                        googlePlaceId: t.restaurant.googlePlaceId,
                        name: t.restaurant.name,
                        address: t.restaurant.address,
                        from: t.visitId,
                        date: t.visitedAt,
                        by: t.by.displayName,
                      },
                    })
                  }
                />
                <Button
                  title="Remove tag"
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={`Remove your tag from ${t.by.displayName}'s ${t.restaurant.name} visit`}
                  onPress={() => untag.mutate(t.visitId)}
                />
              </View>
            </View>
          </Fragment>
        ))}
      </Card>
    </Section>
  );
}
