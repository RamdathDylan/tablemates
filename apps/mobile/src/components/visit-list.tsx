import type { Visit, VisitAudience } from '@tablemates/shared';
import { Button, Card, Divider, IconButton, Sheet, useToast, VisitListItem } from '@tablemates/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

import { AudiencePicker, audiences } from './audience-picker';

/** A list of visits. `editable` (your own profile) adds a control for who can see each one. */
export function VisitList({ visits, editable }: { visits: Visit[]; editable?: boolean }) {
  const [editing, setEditing] = useState<Visit | null>(null);

  return (
    <>
      <Card padding={0} style={{ paddingVertical: 4 }}>
        {visits.map((v, i) => (
          <Fragment key={v.id}>
            {i > 0 && <Divider inset={3} />}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <VisitListItem
                  restaurantName={v.restaurant.name}
                  visitedAt={v.visitedAt}
                  rating={v.review?.rating}
                  recommends={v.review?.recommends}
                  onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: v.restaurant.id } })}
                />
              </View>
              {editable && (
                <View style={{ marginRight: 8 }}>
                  <IconButton
                    icon={audiences[v.audience].icon}
                    accessibilityLabel={`Visible to: ${audiences[v.audience].label}. Change who can see your ${v.restaurant.name} visit`}
                    onPress={() => setEditing(v)}
                  />
                </View>
              )}
            </View>
          </Fragment>
        ))}
      </Card>
      {editing && <AudienceSheet visit={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AudienceSheet({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const [audience, setAudience] = useState<VisitAudience>(visit.audience);
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => api.setVisitAudience(visit.id, audience),
    onSuccess: () => {
      for (const key of [qk.myVisits, ['map'], qk.restaurant(visit.restaurant.id)]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      toast(`Now visible to: ${audiences[audience].label}`, 'success');
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't update the visit.", 'danger'),
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Who can see your ${visit.restaurant.name} visit?`}
      footer={<Button title="Save" fullWidth size="lg" loading={save.isPending} onPress={() => save.mutate()} />}>
      <AudiencePicker value={audience} onChange={setAudience} />
    </Sheet>
  );
}
