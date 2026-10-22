import type { Streak } from '@tablemates/shared';
import { Chip } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

/** Streak lengths worth a celebration toast. */
export const STREAK_MILESTONES = [4, 10, 26, 52];

export function useStreak() {
  return useQuery({ queryKey: qk.streak, queryFn: api.streak });
}

/** "🔥 6" with a spoken label. Hidden with no streak. `own` adds the at-risk hint. */
export function StreakChip({ streak, own = false }: { streak: Streak | undefined; own?: boolean }) {
  if (!streak?.current) return null;
  const weeks = `${streak.current}-week streak`;
  const atRisk = own && !streak.thisWeekDone;
  return (
    <Chip
      label={atRisk ? `🔥 ${streak.current} · log this week` : `🔥 ${streak.current} wk`}
      tone={atRisk ? 'accent' : 'neutral'}
      accessibilityLabel={atRisk ? `${weeks}. Log a visit this week to keep it` : weeks}
    />
  );
}
