import type { Visit } from '@tablemates/shared';
import { Card, Divider, VisitListItem } from '@tablemates/ui';
import { router } from 'expo-router';
import { Fragment } from 'react';

export function VisitList({ visits }: { visits: Visit[] }) {
  return (
    <Card padding={0} style={{ paddingVertical: 4 }}>
      {visits.map((v, i) => (
        <Fragment key={v.id}>
          {i > 0 && <Divider inset={3} />}
          <VisitListItem
            restaurantName={v.restaurant.name}
            visitedAt={v.visitedAt}
            rating={v.review?.rating}
            recommends={v.review?.recommends}
            onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: v.restaurant.id } })}
          />
        </Fragment>
      ))}
    </Card>
  );
}
