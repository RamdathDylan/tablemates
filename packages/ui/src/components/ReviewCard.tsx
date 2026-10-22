import { Pressable, View } from 'react-native';

import { formatDate } from '../format';
import { useTheme } from '../theme';
import { space } from '../tokens';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { Chip } from './Chip';
import { IconButton } from './IconButton';
import { focusRing, type PressState } from './internal';
import { Rating } from './Rating';
import { Text } from './Text';

export interface ReviewCardProps {
  author: { displayName: string; avatarUrl?: string | null };
  /** Omit on a restaurant's own page, where the name is already the heading. */
  restaurantName?: string;
  rating: number;
  body?: string;
  recommends: boolean;
  dishes?: string[];
  visitedAt: string;
  onPressAuthor?: () => void;
  onPressRestaurant?: () => void;
  /** Shows a bookmark button for the want-to-try list. */
  saved?: boolean;
  onToggleSave?: () => void;
}

export function ReviewCard({
  author,
  restaurantName,
  rating,
  body,
  recommends,
  dishes = [],
  visitedAt,
  onPressAuthor,
  onPressRestaurant,
  saved,
  onToggleSave,
}: ReviewCardProps) {
  const { colors } = useTheme();

  return (
    <Card style={{ gap: space[3] }} role="article">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Pressable
          onPress={onPressAuthor}
          disabled={!onPressAuthor}
          role={onPressAuthor ? 'link' : undefined}
          accessibilityLabel={`${author.displayName}'s profile`}
          style={(state: PressState) => [{ borderRadius: 999 }, focusRing(state, colors)]}>
          <Avatar name={author.displayName} uri={author.avatarUrl} decorative />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {author.displayName}
            {restaurantName && (
              <Text tone="muted">
                {' at '}
                <Text
                  variant="bodyStrong"
                  tone="primary"
                  role={onPressRestaurant ? 'link' : undefined}
                  onPress={onPressRestaurant}>
                  {restaurantName}
                </Text>
              </Text>
            )}
          </Text>
          <Text variant="caption" tone="subtle">
            Visited {formatDate(visitedAt)}
          </Text>
        </View>
        {onToggleSave && (
          <IconButton
            icon={saved ? 'bookmark' : 'bookmark-outline'}
            accessibilityLabel={
              saved ? `Remove ${restaurantName ?? 'this place'} from want to try` : `Save ${restaurantName ?? 'this place'} to want to try`
            }
            aria-pressed={!!saved}
            onPress={onToggleSave}
          />
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <Rating value={rating} size="sm" />
        {recommends && <Chip label="Recommends" tone="primary" icon="thumbs-up" />}
      </View>

      {!!body && <Text>{body}</Text>}

      {dishes.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[1] }}>
          <Text variant="overline" tone="muted" style={{ marginRight: space[1] }}>
            Order
          </Text>
          {dishes.map((d) => (
            <Chip key={d} label={d} tone="accent" />
          ))}
        </View>
      )}
    </Card>
  );
}
