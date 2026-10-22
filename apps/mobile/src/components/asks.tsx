import type { Ask } from '@tablemates/shared';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  focusRing,
  Icon,
  IconButton,
  Input,
  Rating,
  radius,
  Sheet,
  space,
  Text,
  TextArea,
  timeAgo,
  useTheme,
  useToast,
  type PressState,
} from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { qk } from '@/lib/query-keys';
import { useSaveToggle } from '@/lib/use-save';

import { PlacePicker, type PickedPlace } from './place-picker';

/** Feed header: a prompt to ask your friends, then any open asks. */
export function AsksSection() {
  const asks = useQuery({ queryKey: qk.asks, queryFn: api.asks });
  const [composing, setComposing] = useState(false);
  return (
    <View style={{ gap: space[3] }}>
      <AskPrompt onPress={() => setComposing(true)} />
      {asks.data?.map((a) => <AskCard key={a.id} ask={a} />)}
      {composing && <AskComposer onClose={() => setComposing(false)} />}
    </View>
  );
}

function AskPrompt({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityLabel="Ask your friends for a recommendation"
      onPress={onPress}
      style={(state: PressState) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          minHeight: 52,
          paddingHorizontal: space[4],
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.borderInput,
          backgroundColor: state.pressed || state.hovered ? colors.surfaceSunken : colors.surface,
        },
        focusRing(state, colors),
      ]}>
      <Icon name="help-circle-outline" color="primary" />
      <Text tone="subtle">Ask your friends: “Best ramen near…?”</Text>
    </Pressable>
  );
}

function AskComposer({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState('');
  const [area, setArea] = useState('');
  const post = useMutation({
    mutationFn: () => api.createAsk({ question, areaLabel: area || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.asks });
      toast('Asked your friends', 'success');
      onClose();
    },
  });
  const error = post.error instanceof ApiError ? post.error.message : undefined;
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Ask your friends"
      footer={<Button title="Ask" fullWidth size="lg" loading={post.isPending} disabled={question.trim().length < 5} onPress={() => post.mutate()} />}>
      <TextArea
        label="Your question"
        placeholder="Best ramen near Union Square?"
        value={question}
        onChangeText={setQuestion}
        maxLength={200}
        helperText={`${question.length}/200 · Open to friends for a week`}
        error={error}
      />
      <Input label="Area (optional)" icon="location-outline" placeholder="Union Square" value={area} onChangeText={setArea} maxLength={60} />
    </Sheet>
  );
}

function AskCard({ ask }: { ask: Ask }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const save = useSaveToggle();
  const [suggesting, setSuggesting] = useState(false);
  const mine = ask.author.id === me.id;
  const close = useMutation({
    mutationFn: () => api.closeAsk(ask.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.asks }),
  });

  return (
    <Card
      style={{ gap: space[3] }}
      role="article"
      aria-label={mine ? `Your question: ${ask.question}` : `${ask.author.displayName} asks: ${ask.question}`}>
      <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
        <Avatar name={ask.author.displayName} uri={ask.author.avatarUrl} decorative />
        <View style={{ flex: 1 }}>
          <Text variant="label">
            {mine ? 'You asked' : `${ask.author.displayName} asks`}{' '}
            <Text variant="caption" tone="muted">
              · {timeAgo(ask.createdAt)}
            </Text>
          </Text>
          <Text variant="subheading">{ask.question}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        {ask.areaLabel && <Chip label={ask.areaLabel} icon="location" />}
        {!ask.open && <Chip label="Closed" icon="lock-closed" />}
      </View>

      {ask.replies.length > 0 && (
        <View>
          {ask.replies.map((r, i) => (
            <Fragment key={r.id}>
              {i > 0 && <Divider spacing={2} />}
              <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    variant="bodyStrong"
                    tone="primary"
                    role="link"
                    onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.restaurant.id } })}>
                    {r.restaurant.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                    <Text variant="caption" tone="muted">
                      {r.author.displayName}
                    </Text>
                    {r.rating !== null && <Rating value={r.rating} size="sm" />}
                  </View>
                  {!!r.note && <Text variant="caption">“{r.note}”</Text>}
                </View>
                <IconButton
                  icon={r.saved ? 'bookmark' : 'bookmark-outline'}
                  size="sm"
                  aria-pressed={r.saved}
                  accessibilityLabel={r.saved ? `Remove ${r.restaurant.name} from want to try` : `Save ${r.restaurant.name} to want to try`}
                  onPress={() =>
                    save.mutate(
                      { restaurantId: r.restaurant.id, saved: r.saved, name: r.restaurant.name },
                      { onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.asks }) },
                    )
                  }
                />
              </View>
            </Fragment>
          ))}
        </View>
      )}

      {mine
        ? ask.open && <Button title="Close question" variant="ghost" size="sm" onPress={() => close.mutate()} />
        : ask.open && <Button title="Suggest a place" icon="restaurant" variant="secondary" onPress={() => setSuggesting(true)} />}
      {suggesting && <SuggestSheet ask={ask} onClose={() => setSuggesting(false)} />}
    </Card>
  );
}

/** Pick a place, add a note, and send it. */
function SuggestSheet({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<PickedPlace | null>(null);

  const send = useMutation({
    mutationFn: () => api.replyToAsk(ask.id, { restaurantId: picked?.restaurantId, googlePlaceId: picked?.googlePlaceId, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.asks });
      toast(`Suggested ${picked?.name}`, 'success');
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't send. Try again.", 'danger'),
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={ask.question}
      footer={<Button title={picked ? `Suggest ${picked.name}` : 'Pick a place'} fullWidth size="lg" disabled={!picked} loading={send.isPending} onPress={() => send.mutate()} />}>
      <PlacePicker value={picked} onChange={setPicked} />
      <Input label="Why go? (optional)" placeholder="Get the spicy miso" value={note} onChangeText={setNote} maxLength={200} />
    </Sheet>
  );
}
