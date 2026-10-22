import {
  Avatar,
  EmptyState,
  IconButton,
  Input,
  Sheet,
  Skeleton,
  space,
  Text,
  timeAgo,
  useToast,
} from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

/** A review's comment thread, with a box to add one. */
export function CommentsSheet({ reviewId, title, onClose }: { reviewId: string; title: string; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const thread = useQuery({ queryKey: qk.comments(reviewId), queryFn: () => api.comments(reviewId) });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.comments(reviewId) });
    queryClient.invalidateQueries({ queryKey: qk.feed });
    queryClient.invalidateQueries({ queryKey: ['restaurant'] });
  };
  const post = useMutation({
    mutationFn: () => api.addComment(reviewId, draft),
    onSuccess: () => {
      setDraft('');
      refresh();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't post. Try again.", 'danger'),
  });
  const remove = useMutation({ mutationFn: api.deleteComment, onSuccess: refresh });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={title}
      footer={
        <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Add a comment"
              hideLabel
              placeholder="Add a comment…"
              value={draft}
              onChangeText={setDraft}
              maxLength={500}
              onSubmitEditing={() => draft.trim() && post.mutate()}
              returnKeyType="send"
            />
          </View>
          <IconButton
            icon="send"
            variant="primary"
            size="lg"
            accessibilityLabel="Post comment"
            disabled={!draft.trim() || post.isPending}
            onPress={() => post.mutate()}
          />
        </View>
      }>
      {thread.isPending ? (
        <View style={{ gap: space[3] }}>
          <Skeleton height={40} />
          <Skeleton height={40} />
        </View>
      ) : thread.data?.length ? (
        thread.data.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
            <Avatar name={c.author.displayName} uri={c.author.avatarUrl} size="sm" decorative />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">
                {c.author.displayName} <Text variant="caption" tone="muted">· {timeAgo(c.createdAt)}</Text>
              </Text>
              <Text>{c.body}</Text>
            </View>
            {c.canDelete && (
              <IconButton
                icon="trash-outline"
                size="sm"
                accessibilityLabel={`Delete ${c.author.displayName}'s comment`}
                onPress={() => remove.mutate(c.id)}
              />
            )}
          </View>
        ))
      ) : (
        <EmptyState icon="chatbubbles-outline" title="No comments yet" message="Ask what to order, or say you're going." />
      )}
    </Sheet>
  );
}
