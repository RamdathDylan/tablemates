import type { Visit, VisitAudience } from '@tablemates/shared';
import { Button, Card, Divider, formatDate, Sheet, Text, useToast, VisitListItem } from '@tablemates/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Fragment, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

import { AudiencePicker, audiences } from './audience-picker';

export function AudienceSheet({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const [audience, setAudience] = useState<VisitAudience>(visit.audience);
  const queryClient = useQueryClient();
  const toast = useToast();
  // Making a tagged visit private removes the tags; the sheet says so before saving.
  const dropsTags = audience === 'private' && visit.companions.length > 0;
  const save = useMutation({
    mutationFn: () => api.setVisitAudience(visit.id, audience, dropsTags),
    onSuccess: () => {
      for (const key of [qk.myVisits, qk.myVisitsAt(visit.restaurant.id), ['map'], qk.restaurant(visit.restaurant.id), qk.feed]) {
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
      {dropsTags && (
        <Text tone="danger" role="alert">
          Saving removes {visit.companions.map((c) => c.displayName).join(', ')} from this visit. They will no longer see it.
        </Text>
      )}
    </Sheet>
  );
}

/**
 * A person's visits, one row per restaurant (newest first). Repeat visits show
 * "4 visits · last Oct 5"; the full timeline lives on the restaurant page.
 */
export function VisitList({ visits }: { visits: Visit[] }) {
  const groups = new Map<string, Visit[]>();
  for (const v of visits) groups.set(v.restaurant.id, [...(groups.get(v.restaurant.id) ?? []), v]);
  return (
    <Card padding={0} style={{ paddingVertical: 4 }}>
      {[...groups.values()].map((g, i) => {
        const latest = g[0]!;
        const rated = g.find((v) => v.review);
        return (
          <Fragment key={latest.restaurant.id}>
            {i > 0 && <Divider inset={3} />}
            <VisitListItem
              restaurantName={latest.restaurant.name}
              visitedAt={latest.visitedAt}
              rating={rated?.review?.rating}
              recommends={rated?.review?.recommends}
              subtitle={g.length > 1 ? `${g.length} visits · last ${formatDate(latest.visitedAt)}` : undefined}
              onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: latest.restaurant.id } })}
            />
          </Fragment>
        );
      })}
    </Card>
  );
}
