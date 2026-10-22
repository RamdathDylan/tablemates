import type { ReactionKind } from '@tablemates/shared';
import { useToast } from '@tablemates/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from './api';
import { qk } from './query-keys';

/** Toggles a reaction, then refreshes wherever the review is shown. */
export function useReaction() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ reviewId, kind, on }: { reviewId: string; kind: ReactionKind; on: boolean }) =>
      on ? api.unreact(reviewId, kind) : api.react(reviewId, kind),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.feed });
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't react. Try again.", 'danger'),
  });
}
