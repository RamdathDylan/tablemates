import type { Visit } from '@tablemates/shared';
import { Card, Chip, Divider, formatDate, IconButton, joinNames, Rating, RatingTrend, space, Text } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { View } from 'react-native';

import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

import { audiences } from './audience-picker';
import { Section } from './screen';
import { AudienceSheet } from './visit-list';

/** Restaurant page: your visit timeline here, with how your rating has changed. */
export function YourVisits({ restaurantId }: { restaurantId: string }) {
  const visits = useQuery({ queryKey: qk.myVisitsAt(restaurantId), queryFn: () => api.myVisitsAt(restaurantId) });
  const [editing, setEditing] = useState<Visit | null>(null);
  if (!visits.data?.length) return null;
  const rated = visits.data.flatMap((v) => (v.review ? [{ date: v.visitedAt, rating: v.review.rating }] : []));

  return (
    <Section title={visits.data.length === 1 ? 'Your visit' : `Your visits · ${visits.data.length}`}>
      <Card style={{ gap: space[3] }}>
        {rated.length >= 2 && <RatingTrend points={rated} />}
        <View>
          {visits.data.map((v, i) => (
            <Fragment key={v.id}>
              {i > 0 && <Divider spacing={2} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label">{formatDate(v.visitedAt)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                    {v.review ? <Rating value={v.review.rating} size="sm" /> : <Text variant="caption" tone="muted">No review</Text>}
                    {v.review?.recommends && <Chip label="Recommended" tone="primary" icon="thumbs-up" />}
                  </View>
                  {v.companions.length > 0 && (
                    <Text variant="caption" tone="muted">
                      with {joinNames(v.companions.map((c) => c.displayName))}
                    </Text>
                  )}
                </View>
                <IconButton
                  icon={audiences[v.audience].icon}
                  accessibilityLabel={`Visible to: ${audiences[v.audience].label}. Change who can see your ${formatDate(v.visitedAt)} visit`}
                  onPress={() => setEditing(v)}
                />
              </View>
            </Fragment>
          ))}
        </View>
      </Card>
      {editing && <AudienceSheet visit={editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}
