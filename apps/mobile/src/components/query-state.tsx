import { Card, EmptyState, Skeleton, space } from '@tablemates/ui';
import { View } from 'react-native';

import { ApiError } from '@/lib/api';

/** Card-shaped placeholders while a list loads. */
export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: space[4] }} accessibilityLabel="Loading" role="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
            <Skeleton width={40} height={40} radius="full" />
            <View style={{ flex: 1, gap: space[2] }}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="35%" height={12} />
            </View>
          </View>
          <Skeleton height={14} />
          <Skeleton width="80%" height={14} />
        </Card>
      ))}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError ? error.message : 'Check your connection and try again.';
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Couldn't load this"
      message={message}
      action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined}
    />
  );
}
