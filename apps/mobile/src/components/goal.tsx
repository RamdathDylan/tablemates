import type { Goal, Profile } from '@tablemates/shared';
import { Button, Card, Chip, Input, radius, Sheet, space, Text, useTheme, useToast } from '@tablemates/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

const PRESETS = [12, 24, 52];

/** How far through the goal's year we are (0–1). Past years are complete. */
function yearProgress(year: number, now = new Date()) {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

/** "on pace", "3 behind pace", or "Goal reached". */
export function paceLabel(goal: Goal) {
  if (goal.done >= goal.target) return 'Goal reached 🎉';
  const behind = Math.ceil(goal.target * yearProgress(goal.year) - goal.done);
  return behind > 0 ? `${behind} behind pace` : 'on pace';
}

/** A single meter: the bar plus "18 of 30 new places · on pace". */
export function GoalMeter({ goal }: { goal: Goal }) {
  const { colors } = useTheme();
  const share = Math.min(1, goal.done / goal.target);
  const summary = `${goal.done} of ${goal.target} new places · ${paceLabel(goal)}`;
  return (
    <View style={{ gap: space[2] }}>
      <View
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal.target}
        aria-valuenow={Math.min(goal.done, goal.target)}
        accessibilityLabel={`${goal.year} goal: ${summary}`}
        style={{ height: 12, borderRadius: radius.full, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}>
        <View style={{ width: `${share * 100}%`, height: '100%', borderRadius: radius.full, backgroundColor: colors.primary }} />
      </View>
      <Text variant="caption" tone="muted">
        {summary}
      </Text>
    </View>
  );
}

/** Profile: this year's goal. Yours can be set and edited; a friend's is read-only. */
export function GoalCard({ profile }: { profile: Profile }) {
  const own = profile.friendship === 'self';
  const [editing, setEditing] = useState(false);
  const goal = profile.goal;
  const year = goal?.year ?? new Date().getFullYear();
  if (!goal && !own) return null;
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {own ? `Your ${year} goal` : `${profile.displayName.split(' ')[0]}'s ${year} goal`}
        </Text>
        {own && goal && <Button title="Edit" size="sm" variant="ghost" onPress={() => setEditing(true)} />}
      </View>
      {goal ? (
        <GoalMeter goal={goal} />
      ) : (
        <>
          <Text variant="caption" tone="muted">
            Pick how many new places you want to try this year. Friends can cheer you on.
          </Text>
          <Button title={`Set a ${year} goal`} icon="flag-outline" variant="secondary" size="sm" onPress={() => setEditing(true)} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
      {editing && <GoalSheet year={year} goal={goal ?? null} username={profile.username} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function GoalSheet({ year, goal, username, onClose }: { year: number; goal: Goal | null; username: string; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState(String(goal?.target ?? 24));
  const n = Number(target);
  const valid = Number.isInteger(n) && n >= 1 && n <= 365;
  const done = () => {
    queryClient.invalidateQueries({ queryKey: qk.profile(username) });
    queryClient.invalidateQueries({ queryKey: qk.notifications });
    onClose();
  };
  const onError = (err: unknown) => toast(err instanceof ApiError ? err.message : "Couldn't save your goal.", 'danger');
  const save = useMutation({
    mutationFn: () => api.setGoal(year, n),
    onSuccess: () => {
      toast(`Goal set: ${n} new places in ${year}`, 'success');
      done();
    },
    onError,
  });
  const remove = useMutation({ mutationFn: () => api.deleteGoal(year), onSuccess: done, onError });
  return (
    <Sheet
      visible
      onClose={onClose}
      title={`${year} goal`}
      footer={<Button title="Save goal" fullWidth size="lg" disabled={!valid} loading={save.isPending} onPress={() => save.mutate()} />}>
      <Text tone="muted">How many places you’ve never been to do you want to try?</Text>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {PRESETS.map((p) => (
          <Chip key={p} label={`${p}`} accessibilityLabel={`${p} new places`} selected={n === p} onPress={() => setTarget(String(p))} />
        ))}
      </View>
      <Input
        label="New places"
        value={target}
        onChangeText={(t) => setTarget(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        maxLength={3}
        error={target && !valid ? 'Pick a number from 1 to 365' : undefined}
      />
      {goal && <Button title="Remove goal" variant="ghost" size="sm" loading={remove.isPending} onPress={() => remove.mutate()} style={{ alignSelf: 'flex-start' }} />}
    </Sheet>
  );
}
