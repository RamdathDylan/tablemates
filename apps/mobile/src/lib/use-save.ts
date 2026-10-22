import { useToast } from '@tablemates/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from './api';
import { qk } from './query-keys';

/** Adds or removes a restaurant from the want-to-try list. */
export function useSaveToggle() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ restaurantId, saved }: { restaurantId: string; saved: boolean; name?: string }) =>
      saved ? api.unsavePlace(restaurantId) : api.savePlace(restaurantId),
    onSuccess: (_, { restaurantId, saved, name }) => {
      toast(saved ? 'Removed from Want to try' : `Saved${name ? ` ${name}` : ''} to Want to try`, saved ? 'neutral' : 'success');
      for (const key of [qk.saved, qk.feed, qk.restaurant(restaurantId), ['map']]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't update your list.", 'danger'),
  });
}
